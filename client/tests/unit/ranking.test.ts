import { describe, expect, test } from "vitest"

import { rankingSchema, type Shares } from "@/data/schemas"
import { outlinePath } from "@/lib/outline"
import { barSegments, inTenths, wholePercent } from "@/lib/ranking"
import rankingFile from "@fixtures/release/ranking.json"

const withMet = (met: Shares["met"]): Shares => ({
  met,
  rules: { "3": 0, "30": 0, "300": 0 },
})

/** A square ring around the centre, closed */
const square = (size: number): Array<[number, number]> => [
  [-size, -size],
  [size, -size],
  [size, size],
  [-size, size],
  [-size, -size],
]

describe("the ranking's order", () => {
  const ranking = rankingSchema.parse(rankingFile)

  test("a release whose rows are not in rank order is refused", () => {
    const [first, second, ...rest] = ranking.capitals
    const swapped = { ...ranking, capitals: [second, first, ...rest] }
    expect(rankingSchema.safeParse(swapped).success).toBe(false)
  })

  test("a release with a gap in its ranks is refused", () => {
    const [first, second, ...rest] = ranking.capitals
    const gap = {
      ...ranking,
      capitals: [first, { ...second, rank: 3 }, ...rest],
    }
    expect(rankingSchema.safeParse(gap).success).toBe(false)
  })

  test("a partial release has as many rows as capitals", () => {
    const partial = {
      ...ranking,
      complete: false,
      capitals: [ranking.capitals[0]],
    }
    expect(rankingSchema.parse(partial).capitals).toHaveLength(1)
  })
})

describe("whole percents", () => {
  test("a share becomes a whole percent", () => {
    expect(wholePercent(0)).toBe(0)
    expect(wholePercent(0.3)).toBe(30)
    expect(wholePercent(0.1076)).toBe(11)
    expect(wholePercent(1)).toBe(100)
  })

  test("half a percent rounds up, as the share is written", () => {
    // 0.285 and 0.145 are stored just below their written value
    expect(wholePercent(0.285)).toBe(29)
    expect(wholePercent(0.145)).toBe(15)
    expect(wholePercent(0.1049)).toBe(10)
    expect(wholePercent(0.005)).toBe(1)
    expect(wholePercent(0.0049)).toBe(0)
  })

  test("two capitals can show the same percent, each keeping its rank", () => {
    expect(wholePercent(0.1149)).toBe(wholePercent(0.1051))
  })
})

describe("about N in 10", () => {
  test("follows the whole percent shown", () => {
    expect(inTenths(0.3)).toBe(3)
    expect(inTenths(0.2178)).toBe(2)
    // Shown at 25%: about 3 in 10
    expect(inTenths(0.2462)).toBe(3)
    expect(inTenths(0.2449)).toBe(2)
  })

  test("from fewer than 1 in 10 to nearly all", () => {
    expect(inTenths(0.04)).toBe(0)
    expect(inTenths(0.05)).toBe(1)
    expect(inTenths(0.96)).toBe(10)
  })
})

describe("a capital's bar", () => {
  test("all 3, 2, 1 and no rules, always in that order", () => {
    expect(barSegments(withMet([0.1, 0.25, 0.35, 0.3]))).toEqual([
      { rules: 3, share: 0.3 },
      { rules: 2, share: 0.35 },
      { rules: 1, share: 0.25 },
      { rules: 0, share: 0.1 },
    ])
  })

  test("a share of zero has no segment", () => {
    expect(barSegments(withMet([0.8, 0.19, 0.01, 0]))).toEqual([
      { rules: 2, share: 0.01 },
      { rules: 1, share: 0.19 },
      { rules: 0, share: 0.8 },
    ])
  })
})

describe("a capital's outline", () => {
  test("is flipped to SVG's y and fitted to a 100-unit box", () => {
    // 2 km wide, 1 km tall, y north
    const { d, viewBox } = outlinePath([
      [
        [
          [-1000, -500],
          [1000, -500],
          [1000, 500],
          [-1000, -500],
        ],
      ],
    ])
    expect(viewBox).toBe("0 0 100 50")
    // The southern edge is at the bottom of the box
    expect(d).toBe("M0 50L100 50L100 0Z")
  })

  test("draws every polygon and hole as a sub-path", () => {
    const { d, viewBox } = outlinePath([
      [square(10), square(5)],
      [
        [
          [20, 0],
          [30, 0],
          [30, 10],
          [20, 0],
        ],
      ],
    ])
    expect(viewBox).toBe("0 0 100 50")
    expect(d.match(/M/g)).toHaveLength(3)
    expect(d.match(/Z/g)).toHaveLength(3)
    // The hole, inside the square
    expect(d).toContain("M12.5 37.5L37.5 37.5L37.5 12.5L12.5 12.5Z")
  })
})
