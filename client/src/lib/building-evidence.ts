import type {
  EvidenceTile,
  FacadeAttributes,
  Orientation,
} from "@/data/schemas"
import type { BuildingRecord } from "@/lib/building"
import { canopyRadius, ruleThresholds, type Rule } from "@/lib/rules"
import type { VisibleArea } from "@/lib/visible-area"

/*
 * A selected building as the map draws it, from its evidence tile (zoom 15)
 * and the city tiles (zoom 16) that hold its outline and its facades: where
 * it is, its facades on its walls, the trees each facade sees and the sight
 * lines to them, the 500 m circle around it, and the walk to its park. All
 * in longitude and latitude, so the map draws them as they are.
 *
 * An evidence tile writes its places in whole decimetres from its north-west
 * corner, x east and y south, in ground metres: Web Mercator metres times the
 * cosine of the tile's middle latitude.
 */

export type LngLat = [number, number]

/** West, south, east, north */
export type Bounds = [number, number, number, number]

/** A tile of the Web Mercator grid */
export type TileAddress = { z: number; x: number; y: number }

/** The zoom of the evidence tiles */
export const evidenceZoom = 15

/** The zoom of the city tiles that hold the facades */
export const facadesZoom = 16

/** Web Mercator's sphere, in metres */
const EARTH_RADIUS = 6_378_137
const HALF_WORLD = Math.PI * EARTH_RADIUS

const radians = (degrees: number) => (degrees * Math.PI) / 180
const degrees = (value: number) => (value * 180) / Math.PI

/** The tile holding a place at a zoom */
export function tileAt([longitude, latitude]: LngLat, z: number): TileAddress {
  const n = 2 ** z
  const y = (1 - Math.asinh(Math.tan(radians(latitude))) / Math.PI) / 2
  return {
    z,
    x: Math.min(n - 1, Math.floor(((longitude + 180) / 360) * n)),
    y: Math.min(n - 1, Math.floor(y * n)),
  }
}

/** The tiles within `reach` columns and rows of a tile */
export type TileWindow = { x: number; y: number; reach: number }

/**
 * The tiles of a zoom that an area touches, row by row, within a window:
 * never more than (2 × reach + 1)², however wide the area
 */
export function tilesCovering(
  [west, south, east, north]: Bounds,
  z: number,
  { x: nearX, y: nearY, reach }: TileWindow
): Array<TileAddress> {
  const from = tileAt([west, north], z)
  const to = tileAt([east, south], z)
  const tiles: Array<TileAddress> = []
  const lastY = Math.min(to.y, nearY + reach)
  const lastX = Math.min(to.x, nearX + reach)
  for (let y = Math.max(from.y, nearY - reach); y <= lastY; y += 1) {
    for (let x = Math.max(from.x, nearX - reach); x <= lastX; x += 1) {
      tiles.push({ z, x, y })
    }
  }
  return tiles
}

/** The four tiles under a tile, one zoom deeper */
export const childTiles = ({ z, x, y }: TileAddress): Array<TileAddress> =>
  [0, 1].flatMap((dy) =>
    [0, 1].map((dx) => ({ z: z + 1, x: x * 2 + dx, y: y * 2 + dy }))
  )

/** A tile corner's latitude */
const latitudeAt = (z: number, y: number) =>
  degrees(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))))

/** A place of an evidence tile, as longitude and latitude */
export function evidencePlace(
  { z, x, y }: TileAddress,
  [east, south]: readonly [number, number]
): LngLat {
  const size = (2 * HALF_WORLD) / 2 ** z
  const k = Math.cos(radians(latitudeAt(z, y + 0.5)))
  const mx = -HALF_WORLD + x * size + east / 10 / k
  const my = HALF_WORLD - y * size - south / 10 / k
  return [
    degrees(mx / EARTH_RADIUS),
    degrees(2 * Math.atan(Math.exp(my / EARTH_RADIUS)) - Math.PI / 2),
  ]
}

/** A tree seen from a facade, and the viewpoint it is seen from */
export type SightLine = { from: LngLat; tree: LngLat }

/** A facade, drawn on its wall */
export type DrawnFacade = {
  sid: number
  /** Whether it sees 3 trees or more */
  passes: boolean
  /** Its line, in one or more pieces (one per city tile it crosses) */
  pieces: Array<Array<LngLat>>
  /** The trees it sees */
  sights: Array<SightLine>
}

/** A selected building: what the panel says of it, and what the map draws */
export type BuildingSelection = {
  record: BuildingRecord
  /** Its representative point: the centre of its 500 m circle */
  centre: LngLat
  /** The bounds of its outline */
  bounds: Bounds
  /** In the order of their ids, as the keyboard goes through them */
  facades: Array<DrawnFacade>
  /** Its walk to the park, from its outline; null without one */
  route: Array<LngLat> | null
  /** The green space its walk reaches, or that it touches */
  park: { name: string | null; ring: Array<LngLat> } | null
}

/** What a city tile holds of a building (see the map's tile worker) */
export type BuildingTilePart = {
  place: {
    longitude: number
    latitude: number
    bounds: Bounds
  } | null
  facades: Array<{
    sid: number
    ok: number
    n: number
    orient: string
    res: number
    path: Array<LngLat>
  }>
}

/** The bounds of what the tiles hold of a building, or null for none */
export function partsBounds(parts: Iterable<BuildingTilePart>): Bounds | null {
  let bounds: Bounds | null = null
  for (const { place } of parts) {
    if (!place) {
      continue
    }
    const [west, south, east, north] = place.bounds
    bounds = bounds
      ? [
          Math.min(bounds[0], west),
          Math.min(bounds[1], south),
          Math.max(bounds[2], east),
          Math.max(bounds[3], north),
        ]
      : [west, south, east, north]
  }
  return bounds
}

const isOrientation = (value: string): value is Orientation =>
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].includes(value)

/**
 * A building's selection, from its evidence tile and what the city tiles
 * hold of it; null when the tile has no such building, or the city tiles
 * do not know where it is
 */
export function buildingSelection(
  tile: EvidenceTile,
  id: number,
  parts: ReadonlyArray<BuildingTilePart>
): BuildingSelection | null {
  const building = tile.buildings[String(id)]
  const place = parts.find((part) => part.place !== null)?.place
  const bounds = partsBounds(parts)
  if (!building || !place || !bounds) {
    return null
  }
  const address: TileAddress = {
    z: tile.tile[0],
    x: tile.tile[1],
    y: tile.tile[2],
  }
  const at = (point: readonly [number, number] | undefined) =>
    point ? evidencePlace(address, point) : undefined

  // Each facade's pieces and attributes, from every tile it crosses
  const pieces = new Map<number, Array<Array<LngLat>>>()
  const attributes = new Map<number, FacadeAttributes>()
  for (const part of parts) {
    for (const facade of part.facades) {
      pieces.set(facade.sid, [...(pieces.get(facade.sid) ?? []), facade.path])
      if (!attributes.has(facade.sid) && isOrientation(facade.orient)) {
        attributes.set(facade.sid, {
          sid: facade.sid,
          b: id,
          ok: facade.ok === 1 ? 1 : 0,
          n: facade.n,
          orient: facade.orient,
          res: facade.res,
        })
      }
    }
  }

  const { first, seen, from } = building.facades
  const facades: Array<DrawnFacade> =
    first === null
      ? []
      : seen.map((trees, index) => ({
          sid: first + index,
          passes: trees.length >= ruleThresholds.trees,
          pieces: pieces.get(first + index) ?? [],
          sights: trees.flatMap((ref, j) => {
            const tree = at(tile.trees[ref])
            const viewpoint = at(tile.points[from[index]?.[j] ?? -1])
            return tree && viewpoint ? [{ from: viewpoint, tree }] : []
          }),
        }))

  const park =
    building.park === null ? undefined : tile.parks[String(building.park)]
  const route = building.route?.flatMap((ref) => {
    const point = at(tile.points[ref])
    return point ? [point] : []
  })

  return {
    record: {
      id,
      building,
      park: park ? { name: park.name, kind: park.kind, ha: park.ha } : null,
      facades: [...attributes.values()],
    },
    centre: [place.longitude, place.latitude],
    bounds,
    facades,
    route: route && route.length > 1 ? route : null,
    park: park
      ? {
          name: park.name,
          ring: park.ring.map((point) => evidencePlace(address, point)),
        }
      : null,
  }
}

/** Metres on the ground in a degree of latitude */
const METRES_PER_DEGREE = (2 * Math.PI * EARTH_RADIUS) / 360

/** An area grown by some metres on every side */
function grown([west, south, east, north]: Bounds, metres: number): Bounds {
  const latitude = radians((south + north) / 2)
  const across = metres / (METRES_PER_DEGREE * Math.cos(latitude))
  const up = metres / METRES_PER_DEGREE
  return [west - across, south - up, east + across, north + up]
}

/** The bounds of an area and some places */
function including(bounds: Bounds, places: Iterable<LngLat>): Bounds {
  let [west, south, east, north] = bounds
  for (const [longitude, latitude] of places) {
    west = Math.min(west, longitude)
    east = Math.max(east, longitude)
    south = Math.min(south, latitude)
    north = Math.max(north, latitude)
  }
  return [west, south, east, north]
}

/** The ground distance between two places, in metres */
export function groundDistance(a: LngLat, b: LngLat) {
  const x =
    radians(b[0] - a[0]) * Math.cos(radians((a[1] + b[1]) / 2)) * EARTH_RADIUS
  const y = radians(b[1] - a[1]) * EARTH_RADIUS
  return Math.hypot(x, y)
}

const toArea = ([west, south, east, north]: Bounds): VisibleArea => ({
  west,
  south,
  east,
  north,
})

/** Room around the evidence of rule 3, and around a building for rule 300 */
const treesRoom = 30
const buildingRoom = 60
/** How much of the park shows around the end of the walk, in metres */
const parkReach = 140
/** Room around the 500 m circle, in metres */
const circleRoom = 40

/**
 * The area the camera fits to show a rule's evidence: the building and the
 * trees its facades see (or the facade's own), the 500 m circle, or the
 * building, its walk and the park around the walk's end
 */
export function evidenceArea(
  selection: BuildingSelection,
  rule: Rule,
  facade?: number
): VisibleArea {
  if (rule === 30) {
    const [longitude, latitude] = selection.centre
    return toArea(
      grown(
        [longitude, latitude, longitude, latitude],
        canopyRadius + circleRoom
      )
    )
  }
  if (rule === 300) {
    const end = selection.route?.at(-1) ?? selection.centre
    const parkNear = (selection.park?.ring ?? []).filter(
      (place) => groundDistance(place, end) <= parkReach
    )
    return toArea(
      including(grown(selection.bounds, buildingRoom), [
        ...(selection.route ?? []),
        ...parkNear,
      ])
    )
  }
  const facades = selection.facades.filter(
    ({ sid }) => facade === undefined || sid === facade
  )
  return toArea(
    grown(
      including(
        selection.bounds,
        facades.flatMap(({ sights }) => sights.map(({ tree }) => tree))
      ),
      treesRoom
    )
  )
}

/** The widest view in which a building's facades can still be read, in metres */
export const readableWidth = 420

/** The narrowest view the camera fits a selection into, in metres */
export const closestWidth = 140

/**
 * Whether selecting a building, or choosing one of its rules, moves the
 * camera: always for the 500 m circle and the walk to a park; for the
 * trees, only when the building is partly out of view or too small to read
 * its facades
 */
export function fitsEvidence({
  rule,
  bounds,
  inView,
  viewWidth,
}: {
  rule: Rule
  /** The building's bounds */
  bounds: Bounds
  /** The area clear of the map's overlays */
  inView: VisibleArea
  /** The width of the area in view, in metres */
  viewWidth: number
}) {
  if (rule !== 3) {
    return true
  }
  const [west, south, east, north] = bounds
  const outside =
    west < inView.west ||
    east > inView.east ||
    south < inView.south ||
    north > inView.north
  return outside || viewWidth > readableWidth
}

/**
 * The facades that see 3 trees or more
 */
export const passingFacades = (selection: BuildingSelection) =>
  selection.facades.filter(({ passes }) => passes)

/** Where a facade lies from a place: degrees clockwise from north, 0–360 */
function bearing([longitude, latitude]: LngLat, [east, north]: LngLat) {
  const x = (east - longitude) * Math.cos(radians(latitude))
  const y = north - latitude
  return (degrees(Math.atan2(x, y)) + 360) % 360
}

/**
 * The facades the keyboard goes through, as the pointer can click them:
 * every facade with a line on the map, passing or not, around the building
 * clockwise from north (as seen from its representative point, by the
 * middle of each facade's longest piece)
 */
export function keyboardFacades(selection: BuildingSelection) {
  const around = selection.facades
    .filter(({ pieces }) => pieces.length > 0)
    .map((facade) => ({
      facade,
      bearing: bearing(selection.centre, middleOf(facade.pieces)),
    }))
  around.sort((a, b) => a.bearing - b.bearing || a.facade.sid - b.facade.sid)
  return around.map(({ facade }) => facade)
}

/** The middle of a facade's longest piece, end to end */
function middleOf(pieces: ReadonlyArray<Array<LngLat>>): LngLat {
  const span = (piece: Array<LngLat>) =>
    groundDistance(piece[0], piece.at(-1) ?? piece[0])
  const longest = pieces.reduce((best, piece) =>
    span(piece) > span(best) ? piece : best
  )
  const [a, b] = [longest[0], longest.at(-1) ?? longest[0]]
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

/** The 500 m circle around a place, as a closed ring of `steps` places */
export function circleRing(
  [longitude, latitude]: LngLat,
  metres = canopyRadius,
  steps = 128
): Array<LngLat> {
  const up = metres / METRES_PER_DEGREE
  const across = up / Math.cos(radians(latitude))
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = (2 * Math.PI * (index % steps)) / steps
    return [
      longitude + across * Math.cos(angle),
      latitude + up * Math.sin(angle),
    ]
  })
}

/**
 * The first part of a line, `progress` of its length along it (0 to 1), as
 * it draws itself
 */
export function linePart(
  line: ReadonlyArray<LngLat>,
  progress: number
): Array<LngLat> {
  if (progress >= 1 || line.length < 2) {
    return [...line]
  }
  const lengths = line
    .slice(1)
    .map((place, index) => groundDistance(line[index], place))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  let left = Math.max(0, progress) * total
  const part: Array<LngLat> = [line[0]]
  for (const [index, length] of lengths.entries()) {
    const [x0, y0] = line[index]
    const [x1, y1] = line[index + 1]
    if (left > length) {
      part.push(line[index + 1])
      left -= length
      continue
    }
    const share = length > 0 ? left / length : 0
    part.push([x0 + (x1 - x0) * share, y0 + (y1 - y0) * share])
    break
  }
  return part
}

/**
 * Where the name of a building's park goes: at the end of its walk, or,
 * next to the park, on the park's edge nearest the building; none without
 * a park
 */
export function parkAnchor(selection: BuildingSelection): LngLat | undefined {
  const { park, route, centre } = selection
  if (!park) {
    return undefined
  }
  const end = route?.at(-1)
  if (end) {
    return end
  }
  let nearest: LngLat | undefined
  let distance = Infinity
  for (const place of park.ring) {
    const next = groundDistance(place, centre)
    if (next < distance) {
      distance = next
      nearest = place
    }
  }
  return nearest
}
