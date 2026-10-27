/*
 * Where the street names go at street level, worked out on the CPU each time
 * the camera stops, and every 100 ms while it moves. Each candidate prepared
 * by the pipeline is a rectangle on screen, turned with its street (its
 * point, its angle and its text's width). Candidates are tried in order:
 * the names shown last time first, so names do not jump around while the
 * map moves, then the more important streets (rank, then length). A name is
 * kept only if:
 * - its street has room for it at the current zoom;
 * - it lies inside the map, clear of its edges;
 * - its rectangle, with a few pixels around it, touches no name already
 *   kept and none of the obstacles (the map's controls, and later the
 *   evidence of a selected building);
 * - no name of the same street is kept nearby.
 */

/** A rectangle turned on screen: its centre, its direction, its half sizes */
export type TurnedBox = {
  x: number
  y: number
  /** The unit vector along its length */
  ux: number
  uy: number
  halfWidth: number
  halfHeight: number
}

export type NameCandidate = {
  /** The same candidate keeps the same key from one run to the next */
  key: string
  name: string
  longitude: number
  latitude: number
  /** Degrees counter-clockwise from east */
  angle: number
  /** The zoom it was prepared for */
  z: number
  /** Pixels of straight street at that zoom */
  length: number
  /** The text's width, in pixels */
  width: number
  /** 1 for the most important streets */
  rank: number
  /** The street's length, in metres */
  streetLength: number
}

export type PlacementOptions = {
  /** Where a place is on screen, in CSS pixels, y down */
  project: (longitude: number, latitude: number) => readonly [number, number]
  zoom: number
  /** The map's size, in CSS pixels */
  size: { width: number; height: number }
  /** The text box's height, in pixels */
  height: number
  /** Room kept around each name, in pixels */
  padding: number
  /** Room kept free at each end of the street's straight stretch */
  margin: number
  /** The least distance between two names of the same street, in pixels */
  sameStreet: number
  /** Room kept from the map's edges, in pixels */
  inset: number
  obstacles: ReadonlyArray<TurnedBox>
  /** The keys of the names shown after the last run */
  previous: ReadonlySet<string>
}

export type PlacedName = { candidate: NameCandidate; box: TurnedBox }

/** A screen rectangle, padded, as a turned box */
export function boxOfRect(
  rect: { left: number; top: number; right: number; bottom: number },
  padding = 0
): TurnedBox {
  return {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
    ux: 1,
    uy: 0,
    halfWidth: (rect.right - rect.left) / 2 + padding,
    halfHeight: (rect.bottom - rect.top) / 2 + padding,
  }
}

/** Whether two turned boxes overlap (separating axis test) */
export function boxesOverlap(a: TurnedBox, b: TurnedBox) {
  const axes = [
    [a.ux, a.uy],
    [-a.uy, a.ux],
    [b.ux, b.uy],
    [-b.uy, b.ux],
  ] as const
  const dx = b.x - a.x
  const dy = b.y - a.y
  for (const [ax, ay] of axes) {
    const reachA =
      a.halfWidth * Math.abs(a.ux * ax + a.uy * ay) +
      a.halfHeight * Math.abs(-a.uy * ax + a.ux * ay)
    const reachB =
      b.halfWidth * Math.abs(b.ux * ax + b.uy * ay) +
      b.halfHeight * Math.abs(-b.uy * ax + b.ux * ay)
    if (Math.abs(dx * ax + dy * ay) > reachA + reachB) {
      return false
    }
  }
  return true
}

/** The upright rectangle around a turned box: left, top, right, bottom */
function boundsOf(box: TurnedBox) {
  const x = box.halfWidth * Math.abs(box.ux) + box.halfHeight * Math.abs(box.uy)
  const y = box.halfWidth * Math.abs(box.uy) + box.halfHeight * Math.abs(box.ux)
  return [box.x - x, box.y - y, box.x + x, box.y + y] as const
}

/** Boxes filed in a grid of square cells, to test only nearby ones */
export class BoxGrid {
  private cells = new Map<number, Array<TurnedBox>>()

  constructor(private cell = 64) {}

  private *keys(box: TurnedBox) {
    const [left, top, right, bottom] = boundsOf(box)
    for (
      let column = Math.floor(left / this.cell);
      column <= Math.floor(right / this.cell);
      column += 1
    ) {
      for (
        let row = Math.floor(top / this.cell);
        row <= Math.floor(bottom / this.cell);
        row += 1
      ) {
        yield column * 100_003 + row
      }
    }
  }

  add(box: TurnedBox) {
    for (const key of this.keys(box)) {
      const found = this.cells.get(key)
      if (found) {
        found.push(box)
      } else {
        this.cells.set(key, [box])
      }
    }
  }

  hits(box: TurnedBox) {
    for (const key of this.keys(box)) {
      for (const other of this.cells.get(key) ?? []) {
        if (boxesOverlap(box, other)) {
          return true
        }
      }
    }
    return false
  }
}

/** The order candidates are tried in */
function byPriority(previous: ReadonlySet<string>) {
  return (a: NameCandidate, b: NameCandidate) =>
    Number(!previous.has(a.key)) - Number(!previous.has(b.key)) ||
    a.rank - b.rank ||
    b.streetLength - a.streetLength ||
    b.length - a.length ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
}

/** The names kept, each with its box on screen (padding included) */
export function placeStreetNames(
  candidates: ReadonlyArray<NameCandidate>,
  options: PlacementOptions
): Array<PlacedName> {
  const { size, inset, padding, height, zoom } = options
  const order = [...candidates]
  order.sort(byPriority(options.previous))
  const grid = new BoxGrid()
  for (const obstacle of options.obstacles) {
    grid.add(obstacle)
  }
  const kept = new Map<string, Array<readonly [number, number]>>()
  const placed: Array<PlacedName> = []

  for (const candidate of order) {
    const { width } = candidate
    // The street's straight stretch, at the current zoom
    if (
      candidate.length * 2 ** (zoom - candidate.z) <
      width + 2 * options.margin
    ) {
      continue
    }
    const [x, y] = options.project(candidate.longitude, candidate.latitude)
    if (
      x < -width ||
      y < -width ||
      x > size.width + width ||
      y > size.height + width
    ) {
      continue
    }
    const angle = (candidate.angle * Math.PI) / 180
    const box: TurnedBox = {
      x,
      y,
      ux: Math.cos(angle),
      uy: -Math.sin(angle),
      halfWidth: width / 2 + padding,
      halfHeight: height / 2 + padding,
    }
    const [left, top, right, bottom] = boundsOf(box)
    if (
      left < inset ||
      top < inset ||
      right > size.width - inset ||
      bottom > size.height - inset
    ) {
      continue
    }
    const sameStreet = kept.get(candidate.name)
    if (
      sameStreet?.some(
        ([otherX, otherY]) =>
          Math.hypot(otherX - x, otherY - y) < options.sameStreet
      )
    ) {
      continue
    }
    if (grid.hits(box)) {
      continue
    }
    grid.add(box)
    placed.push({ candidate, box })
    if (sameStreet) {
      sameStreet.push([x, y])
    } else {
      kept.set(candidate.name, [[x, y]])
    }
  }
  return placed
}
