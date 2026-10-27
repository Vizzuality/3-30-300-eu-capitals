import { MVTLoader } from "@loaders.gl/mvt"

/*
 * A tile of a capital's city map (`city.pmtiles`), decoded in the map's
 * worker one source layer at a time, so each layer can be drawn on its own
 * (`MVTLayer` decodes a tile into one collection mixing every layer, which
 * cannot be split without copying it). Two things are worked out there too,
 * off the main thread:
 * - the scored buildings of the tile, with their result, centre and area,
 *   for the keyboard's buildings near the centre and the guide's pulse;
 * - the street name candidates that belong to this tile (Tippecanoe also
 *   copies those of the neighbouring tiles into its buffer).
 */

/** The source layers drawn at street level */
export const cityLayers = [
  "land",
  "water",
  "shore",
  "water_marks",
  "parks",
  "streets",
  "canopy",
  "buildings",
  "trees",
] as const

export type CityLayer = (typeof cityLayers)[number]

export type CityTileRequest = { kind: "city" }

/** loaders.gl's binary features, as deck.gl's `GeoJsonLayer` draws them */
export type BinaryFeatures = {
  shape: "binary-feature-collection"
  points: BinaryGeometry
  lines: BinaryGeometry
  polygons: BinaryGeometry & {
    polygonIndices: BinaryAttribute
    primitivePolygonIndices: BinaryAttribute
  }
}

type BinaryAttribute = { value: ArrayLike<number>; size: number }

export type BinaryGeometry = {
  positions: BinaryAttribute
  featureIds: BinaryAttribute
  numericProps: Record<string, BinaryAttribute>
  properties: Array<Record<string, unknown>>
}

/** A street name that may be written along its street, as the pipeline prepared it */
export type StreetLabel = {
  name: string
  longitude: number
  latitude: number
  /** Degrees counter-clockwise from east, never upside down */
  angle: number
  /** The zoom it was prepared for */
  z: number
  /** Pixels of straight street at that zoom */
  length: number
  /** The text's width at 12 px, in pixels */
  width: number
  /** The street's importance: 1 the most important */
  rank: number
  /** The street's length, in metres */
  streetLength: number
}

/**
 * The scored buildings of a tile, five numbers each: id, rules met (0–3),
 * longitude and latitude of its representative point, and its area in
 * square metres within the tile
 */
export const buildingStride = 5

export type CityTileContent = {
  layers: Partial<Record<CityLayer, BinaryFeatures>>
  buildings: Float64Array
  labels: Array<StreetLabel>
}

type TileIndex = { x: number; y: number; z: number }

/** Web Mercator's sphere, in metres */
const EARTH_RADIUS = 6_378_137

export const longitudeOf = (z: number, x: number) => (x / 2 ** z) * 360 - 180
export const latitudeOf = (z: number, y: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI

/** One source layer of a tile, as binary features; none when empty */
export function decodeLayer(
  buffer: ArrayBuffer,
  index: TileIndex,
  layer: string
): BinaryFeatures | undefined {
  const decoded = MVTLoader.parseSync?.(buffer, {
    mvt: {
      shape: "binary",
      coordinates: "local",
      tileIndex: index,
      layers: [layer],
      // No layer name on each feature: each layer is drawn on its own
      layerProperty: "",
    },
  } as never) as BinaryFeatures | undefined
  if (!decoded) {
    return undefined
  }
  const count =
    decoded.points.positions.value.length +
    decoded.lines.positions.value.length +
    decoded.polygons.positions.value.length
  return count > 0 ? decoded : undefined
}

/** The value of a numeric property at a vertex */
export const numeric = (
  geometry: BinaryGeometry,
  key: string,
  vertex: number
) => geometry.numericProps[key]?.value[vertex] ?? Number.NaN

/** Twice the signed area of a ring of tile-local positions */
function twiceRingArea(
  positions: ArrayLike<number>,
  start: number,
  end: number
) {
  let sum = 0
  for (let vertex = start; vertex < end; vertex += 1) {
    const next = vertex + 1 < end ? vertex + 1 : start
    sum +=
      positions[vertex * 2] * positions[next * 2 + 1] -
      positions[next * 2] * positions[vertex * 2 + 1]
  }
  return sum
}

/**
 * The scored buildings of the tile: their attributes come from the first
 * vertex of each of their polygons, their area from every ring (holes run
 * the other way, so they subtract)
 */
function scoredBuildings(
  buildings: BinaryFeatures | undefined,
  index: TileIndex
) {
  if (!buildings) {
    return new Float64Array(0)
  }
  const { polygons } = buildings
  const positions = polygons.positions.value
  const rings = polygons.primitivePolygonIndices.value
  // Metres per tile-local unit, at the tile's middle latitude
  const latitude = latitudeOf(index.z, index.y + 0.5)
  const metres =
    (2 * Math.PI * EARTH_RADIUS * Math.cos((latitude * Math.PI) / 180)) /
    2 ** index.z
  const byId = new Map<number, Array<number>>()
  for (let ring = 0; ring + 1 < rings.length; ring += 1) {
    const start = rings[ring]
    const end = rings[ring + 1]
    if (end <= start || numeric(polygons, "scored", start) !== 1) {
      continue
    }
    const id = numeric(polygons, "id", start)
    const area = (twiceRingArea(positions, start, end) / 2) * metres * metres
    const found = byId.get(id)
    if (found) {
      found[4] += area
    } else {
      byId.set(id, [
        id,
        numeric(polygons, "score", start),
        numeric(polygons, "cx", start),
        numeric(polygons, "cy", start),
        area,
      ])
    }
  }
  const out = new Float64Array(byId.size * buildingStride)
  let at = 0
  for (const values of byId.values()) {
    values[4] = Math.abs(values[4])
    out.set(values, at)
    at += buildingStride
  }
  return out
}

/** The street name candidates whose point lies in this tile, not its buffer */
function streetLabels(buffer: ArrayBuffer, index: TileIndex) {
  const decoded = decodeLayer(buffer, index, "street_labels")
  if (!decoded) {
    return []
  }
  const { points } = decoded
  const positions = points.positions.value
  const size = points.positions.size
  const labels: Array<StreetLabel> = []
  for (let vertex = 0; vertex * size < positions.length; vertex += 1) {
    const x = positions[vertex * size]
    const y = positions[vertex * size + 1]
    if (x < 0 || y < 0 || x >= 1 || y >= 1) {
      continue
    }
    const feature = points.featureIds.value[vertex]
    const name = String(points.properties[feature]?.name ?? "")
    if (name === "") {
      continue
    }
    labels.push({
      name,
      longitude: longitudeOf(index.z, index.x + x),
      latitude: latitudeOf(index.z, index.y + y),
      angle: numeric(points, "angle", vertex),
      z: numeric(points, "z", vertex),
      length: numeric(points, "len", vertex),
      width: numeric(points, "w", vertex),
      rank: numeric(points, "rank", vertex),
      streetLength: numeric(points, "slen", vertex),
    })
  }
  return labels
}

/**
 * The streets without the paths (`path` 1: footways, paths and cycleways,
 * which the release cannot tell apart): at street level they would draw as
 * extra streets beside the roads they run along. Street names come from
 * their own layer, so none is lost.
 */
function withoutPaths(streets: BinaryFeatures): BinaryFeatures | undefined {
  const lines = streets.lines as BinaryGeometry & {
    pathIndices: BinaryAttribute
    globalFeatureIds?: BinaryAttribute
  }
  const paths = lines.pathIndices.value
  const kept: Array<number> = []
  for (let path = 0; path + 1 < paths.length; path++) {
    if (numeric(lines, "path", paths[path]) !== 1) {
      kept.push(path)
    }
  }
  if (kept.length === paths.length - 1) {
    return streets
  }
  if (kept.length === 0) {
    return undefined
  }
  const size = lines.positions.size
  const count = kept.reduce(
    (sum, path) => sum + paths[path + 1] - paths[path],
    0
  )
  // Each per-vertex attribute, keeping the vertices of the streets kept
  const pick = (attribute: BinaryAttribute): BinaryAttribute => {
    const source = attribute.value as unknown as Float32Array
    const target = new (source.constructor as Float32ArrayConstructor)(
      count * attribute.size
    )
    let at = 0
    for (const path of kept) {
      const from = paths[path] * attribute.size
      const to = paths[path + 1] * attribute.size
      target.set(source.subarray(from, to), at)
      at += to - from
    }
    return { value: target, size: attribute.size }
  }
  const indices = new Uint32Array(kept.length + 1)
  for (const [at, path] of kept.entries()) {
    indices[at + 1] = indices[at] + paths[path + 1] - paths[path]
  }
  return {
    ...streets,
    lines: {
      ...lines,
      positions: pick({ value: lines.positions.value, size }),
      pathIndices: { value: indices, size: 1 },
      featureIds: pick(lines.featureIds),
      ...(lines.globalFeatureIds && {
        globalFeatureIds: pick(lines.globalFeatureIds),
      }),
      numericProps: Object.fromEntries(
        Object.entries(lines.numericProps).map(([key, attribute]) => [
          key,
          pick(attribute),
        ])
      ),
    } as BinaryGeometry,
  }
}

export function cityTile(
  buffer: ArrayBuffer,
  index: TileIndex,
  _request: CityTileRequest
): CityTileContent {
  const layers: CityTileContent["layers"] = {}
  for (const layer of cityLayers) {
    const decoded = decodeLayer(buffer, index, layer)
    const kept =
      decoded && layer === "streets" ? withoutPaths(decoded) : decoded
    if (kept) {
      layers[layer] = kept
    }
  }
  return {
    layers,
    buildings: scoredBuildings(layers.buildings, index),
    labels: streetLabels(buffer, index),
  }
}
