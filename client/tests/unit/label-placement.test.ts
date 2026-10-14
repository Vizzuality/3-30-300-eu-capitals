import { describe, expect, test } from "vitest"

import { labelGap, labelMargin, labelPlacement } from "@/lib/label-placement"

const label = { width: 180, height: 86 }
const map = { width: 960, height: 900 }

const inside = ({ left, top }: { left: number; top: number }) =>
  left >= labelMargin &&
  top >= labelMargin &&
  left + label.width <= map.width - labelMargin &&
  top + label.height <= map.height - labelMargin

describe("the Home label's place", () => {
  test("centred above the point, 12 px from it", () => {
    expect(labelPlacement({ x: 480, y: 400 }, label, map)).toEqual({
      left: 390,
      top: 400 - labelGap - label.height,
      below: false,
    })
  })

  test("below the point when it would leave the top of the map", () => {
    expect(labelPlacement({ x: 480, y: 60 }, label, map)).toEqual({
      left: 390,
      top: 60 + labelGap,
      below: true,
    })
    // Just enough room above: it stays above
    const lowest = labelMargin + label.height + labelGap
    expect(labelPlacement({ x: 480, y: lowest }, label, map).below).toBe(false)
    expect(labelPlacement({ x: 480, y: lowest - 1 }, label, map).below).toBe(
      true
    )
  })

  test("below a shape, it clears the shape's lowest point by the same gap", () => {
    const shape = { x: 480, y: 60, bottom: 110 }
    expect(labelPlacement(shape, label, map)).toEqual({
      left: 390,
      top: 110 + labelGap,
      below: true,
    })
    // Above, it keeps the same gap from the shape's top
    expect(
      labelPlacement({ x: 480, y: 400, bottom: 450 }, label, map).top
    ).toBe(400 - labelGap - label.height)
  })

  test("slid sideways to stay inside near the left and right edges", () => {
    expect(labelPlacement({ x: 20, y: 400 }, label, map).left).toBe(labelMargin)
    expect(labelPlacement({ x: 950, y: 400 }, label, map).left).toBe(
      map.width - labelMargin - label.width
    )
  })

  test("inside the map wherever the point is, corners included", () => {
    for (let x = 0; x <= map.width; x += 40) {
      for (let y = 0; y <= map.height; y += 30) {
        expect(inside(labelPlacement({ x, y }, label, map))).toBe(true)
      }
    }
  })

  test("on a map too short for either side, where there is more room", () => {
    const short = { width: 960, height: 120 }

    expect(labelPlacement({ x: 480, y: 30 }, label, short)).toMatchObject({
      below: true,
      top: short.height - labelMargin - label.height,
    })
    expect(labelPlacement({ x: 480, y: 90 }, label, short)).toMatchObject({
      below: false,
      top: labelMargin,
    })
  })

  test("a map smaller than the label keeps it at its top left corner", () => {
    expect(
      labelPlacement({ x: 50, y: 50 }, label, { width: 100, height: 60 })
    ).toMatchObject({ left: labelMargin, top: labelMargin })
  })
})
