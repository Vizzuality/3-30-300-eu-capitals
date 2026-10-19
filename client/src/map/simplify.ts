/*
 * Douglas–Peucker simplification of a closed ring in longitudes and
 * latitudes, to a tolerance in metres on the ground: the points kept are the
 * fewest that leave every dropped point within the tolerance of the line
 * through them. The city's soft rings are drawn from its limits simplified
 * this way, as the reference simplifies them (by a 400th of the city's
 * size), so a coast of thousands of points makes a ring of a few hundred;
 * deck.gl has no simplification of its own.
 */

type Point = readonly [number, number]

const metresPerDegree = 111_320

export function simplifyRing<P extends Point>(
  ring: ReadonlyArray<P>,
  tolerance: number
): Array<P> {
  if (ring.length < 4) {
    return [...ring]
  }
  const latitude = ring[0][1]
  const kx = metresPerDegree * Math.cos((latitude * Math.PI) / 180)
  const x = (point: Point) => point[0] * kx
  const y = (point: Point) => point[1] * metresPerDegree
  const keep = new Uint8Array(ring.length)
  keep[0] = 1
  keep[ring.length - 1] = 1
  // The point farthest from the line between two kept ones, by halves; a
  // closed ring starts and ends on the same point, so it is split first at
  // the point farthest from its start
  let far = 0
  let farthest = -1
  for (let index = 1; index < ring.length - 1; index++) {
    const d = Math.hypot(
      x(ring[index]) - x(ring[0]),
      y(ring[index]) - y(ring[0])
    )
    if (d > farthest) {
      farthest = d
      far = index
    }
  }
  keep[far] = 1
  const stack: Array<[number, number]> = [
    [0, far],
    [far, ring.length - 1],
  ]
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number]
    const ax = x(ring[first])
    const ay = y(ring[first])
    const dx = x(ring[last]) - ax
    const dy = y(ring[last]) - ay
    const length = Math.hypot(dx, dy)
    let index = -1
    let distance = tolerance
    for (let middle = first + 1; middle < last; middle++) {
      const px = x(ring[middle]) - ax
      const py = y(ring[middle]) - ay
      const d =
        length === 0 ? Math.hypot(px, py) : Math.abs(px * dy - py * dx) / length
      if (d > distance) {
        distance = d
        index = middle
      }
    }
    if (index >= 0) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }
  return ring.filter((_, index) => keep[index] === 1)
}
