import { describe, expect, test } from "vitest"

import { scaleBar, scaleBarMaxWidth } from "@/lib/scale-bar"

describe("the map's scale bar", () => {
  test("the longest distance of 1, 2 or 5 × 10ⁿ m that fits", () => {
    // 168 px show 119 m: 100 m fits, 200 m does not
    expect(scaleBar(0.71)).toEqual({
      metres: 100,
      value: 100,
      unit: "meter",
      width: 141,
    })
    // 168 px show 84 m: 50 m
    expect(scaleBar(0.5)?.metres).toBe(50)
    // 168 px show 336 m: 200 m
    expect(scaleBar(2)?.metres).toBe(200)
  })

  test("always round, between 40% of the widest width and the widest", () => {
    for (
      let metresPerPixel = 0.01;
      metresPerPixel < 5000;
      metresPerPixel *= 1.07
    ) {
      const bar = scaleBar(metresPerPixel)
      expect(bar?.width).toBeLessThanOrEqual(scaleBarMaxWidth)
      expect(bar?.width).toBeGreaterThanOrEqual(scaleBarMaxWidth * 0.4 - 1)
      const metres = bar?.metres ?? 0
      const leading = metres / 10 ** Math.floor(Math.log10(metres))
      expect([1, 2, 5]).toContainEqual(Number(leading.toPrecision(6)))
    }
  })

  test("a distance exactly the widest width is kept", () => {
    // 168 px show exactly 1000 m
    expect(scaleBar(1000 / scaleBarMaxWidth)).toMatchObject({
      metres: 1000,
      width: scaleBarMaxWidth,
    })
  })

  test("kilometres from 1 km", () => {
    expect(scaleBar(4)).toMatchObject({
      metres: 500,
      value: 500,
      unit: "meter",
    })
    expect(scaleBar(12)).toMatchObject({
      metres: 2000,
      value: 2,
      unit: "kilometer",
    })
  })

  test("short distances without rounding errors", () => {
    expect(scaleBar(0.002)).toMatchObject({ metres: 0.2, value: 0.2 })
  })

  test("a narrower bar picks a shorter distance", () => {
    expect(scaleBar(0.71, 60)?.metres).toBe(20)
  })

  test("no bar for a scale that cannot be drawn", () => {
    expect(scaleBar(0)).toBeUndefined()
    expect(scaleBar(-1)).toBeUndefined()
    expect(scaleBar(Number.NaN)).toBeUndefined()
    expect(scaleBar(Number.POSITIVE_INFINITY)).toBeUndefined()
    expect(scaleBar(1, 0)).toBeUndefined()
  })
})
