import { describe, expect, test } from "vitest"

import { simplifyRing } from "@/map/simplify"

// About 1.1 km a side at 60° north, with points every tenth of a side
const side = 0.02
const square: Array<[number, number]> = []
for (const [x0, y0, x1, y1] of [
  [0, 0, side, 0],
  [side, 0, side, side / 2],
  [side, side / 2, 0, side / 2],
  [0, side / 2, 0, 0],
]) {
  for (let step = 0; step < 10; step += 1) {
    square.push([
      18 + x0 + ((x1 - x0) * step) / 10,
      60 + y0 + ((y1 - y0) * step) / 10,
    ])
  }
}
square.push(square[0])

describe("simplifying a ring", () => {
  test("keeps its corners and drops the points along its sides", () => {
    const simplified = simplifyRing(square, 5)
    expect(simplified).toEqual([
      [18, 60],
      [18 + side, 60],
      [18 + side, 60 + side / 2],
      [18, 60 + side / 2],
      [18, 60],
    ])
  })

  test("a bump within the tolerance goes, one beyond it stays", () => {
    // A point 20 m off the middle of the first side
    const bumped = square.map((point, index) =>
      index === 5
        ? ([point[0], point[1] - 20 / 111_320] as [number, number])
        : point
    )
    expect(simplifyRing(bumped, 30)).toHaveLength(5)
    expect(simplifyRing(bumped, 10)).toContainEqual(bumped[5])
  })

  test("a ring too short to simplify is left as it is", () => {
    const tiny: Array<[number, number]> = [
      [18, 60],
      [18.001, 60],
      [18, 60],
    ]
    expect(simplifyRing(tiny, 50)).toEqual(tiny)
  })
})
