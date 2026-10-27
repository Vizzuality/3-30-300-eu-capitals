import {
  decodeLayer,
  latitudeOf,
  longitudeOf,
  numeric,
  type BinaryFeatures,
} from "./city-tile-decode"

/*
 * A tile of a capital's overview map (`context.pmtiles`), decoded in the
 * map's worker one source layer at a time: its water and its roads, each
 * drawn on its own, and the district names that may be written on it, as
 * plain candidates (those of the tile itself, not of its buffer, where
 * Tippecanoe also copies the neighbouring tiles' points).
 */

export type ContextTileRequest = { kind: "context" }

/** A district's name that may be written on the overview */
export type PlaceCandidate = {
  /** As it is on the map, in its local language (or languages) */
  name: string
  longitude: number
  latitude: number
  /** 1 for the districts, 2 for the finer level */
  tier: number
  /** Residents within 1 km of the point */
  rank: number
  /** The width of `name` at 12 px, in pixels */
  width: number
}

export const roadClasses = [
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
] as const

export type RoadClass = (typeof roadClasses)[number]

/**
 * The roads of one class, as paths ready to draw (deck.gl's binary paths):
 * each path's first vertex, and one past the last path's end; each vertex's
 * x and y in the tile's own coordinates; and each path's flags
 */
export type RoadPaths = {
  length: number
  startIndices: Uint32Array
  positions: Float32Array
  /** 1 for a dual carriageway (its two roads drawn as one) */
  dual: Uint8Array
  /** 1 for a tunnel */
  tunnel: Uint8Array
}

export type ContextTileContent = {
  layers: { water?: BinaryFeatures }
  /** The roads of each class, in the order of `roadClasses` */
  roads: Array<RoadPaths>
  places: Array<PlaceCandidate>
}

type TileIndex = { x: number; y: number; z: number }

function places(buffer: ArrayBuffer, index: TileIndex) {
  const decoded = decodeLayer(buffer, index, "places")
  if (!decoded) {
    return []
  }
  const { points } = decoded
  const positions = points.positions.value
  const size = points.positions.size
  const found: Array<PlaceCandidate> = []
  for (let vertex = 0; vertex * size < positions.length; vertex += 1) {
    const x = positions[vertex * size]
    const y = positions[vertex * size + 1]
    if (x < 0 || y < 0 || x >= 1 || y >= 1) {
      continue
    }
    const properties = points.properties[points.featureIds.value[vertex]] ?? {}
    const name = String(properties.name ?? "")
    if (name === "") {
      continue
    }
    found.push({
      name,
      longitude: longitudeOf(index.z, index.x + x),
      latitude: latitudeOf(index.z, index.y + y),
      tier: numeric(points, "tier", vertex),
      rank: numeric(points, "rank", vertex),
      width: numeric(points, "w", vertex),
    })
  }
  return found
}

/**
 * Simplification of the roads, in tile units: half a pixel of a 512 px
 * tile, which deck.gl draws between 0.7 and 1.4 times its size (larger
 * past the tiles' last zoom, where the roads are wider too). It keeps the
 * paths' vertices, and the cost of drawing them, down.
 */
const roadTolerance = 0.5 / 512

/** The points of a line kept by Douglas–Peucker, as indices */
function simplified(positions: ArrayLike<number>, first: number, last: number) {
  const keep = new Uint8Array(last - first + 1)
  keep[0] = 1
  keep[last - first] = 1
  const stack: Array<[number, number]> = [[first, last]]
  while (stack.length > 0) {
    const [a, b] = stack.pop() as [number, number]
    const ax = positions[a * 2]
    const ay = positions[a * 2 + 1]
    const dx = positions[b * 2] - ax
    const dy = positions[b * 2 + 1] - ay
    const length = Math.hypot(dx, dy)
    let farthest = -1
    let distance = roadTolerance
    for (let middle = a + 1; middle < b; middle++) {
      const px = positions[middle * 2] - ax
      const py = positions[middle * 2 + 1] - ay
      // From the segment between the two ends (not the line through them,
      // which would drop a stretch that doubles back), or from the end
      // itself when they meet (a loop, such as a roundabout)
      const along =
        length > 1e-9
          ? Math.max(0, Math.min(1, (px * dx + py * dy) / (length * length)))
          : 0
      const d = Math.hypot(px - along * dx, py - along * dy)
      if (d > distance) {
        distance = d
        farthest = middle
      }
    }
    if (farthest >= 0) {
      keep[farthest - first] = 1
      stack.push([a, farthest], [farthest, b])
    }
  }
  const kept: Array<number> = []
  for (let index = 0; index < keep.length; index++) {
    if (keep[index]) {
      kept.push(first + index)
    }
  }
  return kept
}

/** The roads by class, as paths, simplified */
function roadPaths(roads: BinaryFeatures | undefined): Array<RoadPaths> {
  const byClass = roadClasses.map(() => ({
    starts: [0] as Array<number>,
    positions: [] as Array<number>,
    dual: [] as Array<number>,
    tunnel: [] as Array<number>,
  }))
  if (roads) {
    const { lines } = roads as BinaryFeatures & {
      lines: BinaryFeatures["lines"] & {
        pathIndices: { value: ArrayLike<number> }
      }
    }
    const positions = lines.positions.value
    const paths = lines.pathIndices.value
    for (let path = 0; path + 1 < paths.length; path++) {
      const first = paths[path]
      const last = paths[path + 1] - 1
      if (last <= first) {
        continue
      }
      const properties = lines.properties[lines.featureIds.value[first]] ?? {}
      const index = roadClasses.indexOf(String(properties.class) as RoadClass)
      const group = byClass[index < 0 ? roadClasses.length - 1 : index]
      for (const at of simplified(positions, first, last)) {
        group.positions.push(positions[at * 2], positions[at * 2 + 1])
      }
      group.starts.push(group.positions.length / 2)
      // Missing on most capitals' roads: one carriageway
      group.dual.push(numeric(lines, "dual", first) === 1 ? 1 : 0)
      group.tunnel.push(numeric(lines, "tunnel", first) === 1 ? 1 : 0)
    }
  }
  return byClass.map(({ starts, positions, dual, tunnel }) => ({
    length: dual.length,
    startIndices: new Uint32Array(starts),
    positions: new Float32Array(positions),
    dual: new Uint8Array(dual),
    tunnel: new Uint8Array(tunnel),
  }))
}

export function contextTile(
  buffer: ArrayBuffer,
  index: TileIndex,
  _request: ContextTileRequest
): ContextTileContent {
  return {
    layers: { water: decodeLayer(buffer, index, "water") },
    roads: roadPaths(decodeLayer(buffer, index, "roads")),
    places: places(buffer, index),
  }
}
