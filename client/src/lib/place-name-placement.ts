import { BoxGrid, type TurnedBox } from "@/lib/street-name-placement"

/*
 * Where the district names go on the city overview, worked out on the CPU
 * as the camera moves: by collision only, as basemaps do, with no count and
 * no cap. Names are tried by priority (the districts first, then the finer
 * level; within each, the most residents first), and a name is written
 * only if its box, with some room around it, touches no name already
 * written and nothing over the map (the legend, the buttons, the
 * attribution, the guide's pulse, the centre's cross, the phone band's
 * fade), and lies inside the map.
 */

export type PlaceLabel = {
  /** The same place keeps the same key from one run to the next */
  key: string
  text: string
  longitude: number
  latitude: number
  /** 1 for the districts, 2 for the finer level */
  tier: number
  /** Residents within 1 km */
  rank: number
  /** The text's width as drawn, halo included, in pixels */
  width: number
}

export type PlaceOptions = {
  /** Where a place is on screen, in CSS pixels, y down */
  project: (longitude: number, latitude: number) => readonly [number, number]
  /** The map's size, in CSS pixels */
  size: { width: number; height: number }
  /** The text's height, halo included, in pixels */
  height: number
  /** The least room between a name and anything else, in pixels */
  padding: number
  /** What lies over the map */
  obstacles: ReadonlyArray<TurnedBox>
}

export type PlacedLabel = { label: PlaceLabel; x: number; y: number }

const byPriority = (a: PlaceLabel, b: PlaceLabel) =>
  a.tier - b.tier ||
  b.rank - a.rank ||
  (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)

/** Why names were left out, for the tests to follow */
export type PlacementCounts = {
  candidates: number
  outside: number
  overlay: number
  name: number
}

/** The names written, each centred on its place */
export function placePlaceNames(
  labels: ReadonlyArray<PlaceLabel>,
  { project, size, height, padding, obstacles }: PlaceOptions,
  counts?: PlacementCounts
): Array<PlacedLabel> {
  const order = [...labels]
  order.sort(byPriority)
  // Boxes as they are; a new one, with its room around it, may touch none
  const overlays = new BoxGrid()
  for (const obstacle of obstacles) {
    overlays.add(obstacle)
  }
  const names = new BoxGrid()
  const placed: Array<PlacedLabel> = []
  if (counts) {
    counts.candidates = labels.length
  }
  const leftOut = (reason: "outside" | "overlay" | "name") => {
    if (counts) {
      counts[reason] += 1
    }
  }
  for (const label of order) {
    const [x, y] = project(label.longitude, label.latitude)
    const box: TurnedBox = {
      x,
      y,
      ux: 1,
      uy: 0,
      halfWidth: label.width / 2,
      halfHeight: height / 2,
    }
    if (
      x - box.halfWidth < 0 ||
      y - box.halfHeight < 0 ||
      x + box.halfWidth > size.width ||
      y + box.halfHeight > size.height
    ) {
      leftOut("outside")
      continue
    }
    const padded = {
      ...box,
      halfWidth: box.halfWidth + padding,
      halfHeight: box.halfHeight + padding,
    }
    if (overlays.hits(padded)) {
      leftOut("overlay")
      continue
    }
    if (names.hits(padded)) {
      leftOut("name")
      continue
    }
    names.add(box)
    placed.push({ label, x, y })
  }
  return placed
}
