/*
 * The buildings with results at street level, as the map's tiles give them:
 * the ones the keyboard goes through (up to 12, nearest the centre of the
 * view first) and the one the guide's pulse sits on (the nearest to where
 * the visitor zoomed in, large enough to be a building rather than a kiosk
 * or a shed).
 */

export type StreetBuilding = {
  id: number
  /** Rules met, 0 to 3 */
  score: number
  /** Its representative point */
  longitude: number
  latitude: number
  /** Its footprint, in square metres */
  area: number
}

/** How many buildings Tab goes through, nearest the centre first */
export const keyboardBuildings = 12

/**
 * The smallest footprint the guide's pulse sits on, in square metres:
 * smaller buildings with results are kiosks, sheds and the like
 */
export const pulseMinArea = 100

/** Web Mercator's sphere, in metres */
const EARTH_RADIUS = 6_378_137

/**
 * The square of the ground distance between two places, in square metres, on
 * the flat ground of a city (good to a few metres over a few kilometres)
 */
function squaredDistance(
  [longitude, latitude]: readonly [number, number],
  building: StreetBuilding
) {
  const radians = Math.PI / 180
  const x =
    (building.longitude - longitude) *
    radians *
    Math.cos(latitude * radians) *
    EARTH_RADIUS
  const y = (building.latitude - latitude) * radians * EARTH_RADIUS
  return x * x + y * y
}

/** The buildings nearest to a place, nearest first (by id when as near) */
export function nearestBuildings(
  buildings: ReadonlyArray<StreetBuilding>,
  at: readonly [number, number],
  count = keyboardBuildings
): Array<StreetBuilding> {
  const byDistance = buildings.map((building) => ({
    building,
    distance: squaredDistance(at, building),
  }))
  byDistance.sort(
    (a, b) => a.distance - b.distance || a.building.id - b.building.id
  )
  return byDistance.slice(0, count).map(({ building }) => building)
}

/**
 * The building the guide's pulse sits on: the nearest to the place of at
 * least `pulseMinArea`, or, when none is that large, the nearest of all
 */
export function pulseBuilding(
  buildings: ReadonlyArray<StreetBuilding>,
  at: readonly [number, number]
): StreetBuilding | undefined {
  const large = buildings.filter(({ area }) => area >= pulseMinArea)
  return nearestBuildings(large.length > 0 ? large : buildings, at, 1)[0]
}

/**
 * The buildings of several tiles as one list: a building cut by tile edges
 * is in each of its tiles, with the part of it inside each; its largest
 * part stands for its footprint
 */
export function mergeBuildings(
  tiles: Iterable<ReadonlyArray<StreetBuilding>>
): Array<StreetBuilding> {
  const byId = new Map<number, StreetBuilding>()
  for (const tile of tiles) {
    for (const building of tile) {
      const found = byId.get(building.id)
      if (!found || building.area > found.area) {
        byId.set(building.id, building)
      }
    }
  }
  return [...byId.values()]
}
