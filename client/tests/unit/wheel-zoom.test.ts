import { describe, expect, test } from "vitest"

import {
  easeZoom,
  isWheelNotch,
  wheelEasing,
  wheelZoom,
} from "@/map/wheel-zoom"

/** The zooms a notch passes through, one frame every `frame` ms */
function frames(from: number, to: number, frame: number) {
  const zooms = [from]
  while (zooms.at(-1) !== to) {
    zooms.push(easeZoom(zooms.at(-1) as number, to, frame))
  }
  return zooms
}

/** A wheel event in pixels */
const pixels = (deltaY: number, ctrlKey = false) => ({
  deltaMode: 0,
  deltaY,
  ctrlKey,
})

describe("zooming with the mouse wheel", () => {
  test("a mouse wheel's notches are eased; a trackpad's steps are not", () => {
    expect(isWheelNotch(pixels(100))).toBe(true)
    expect(isWheelNotch(pixels(-120))).toBe(true)
    expect(isWheelNotch({ deltaMode: 1, deltaY: 3, ctrlKey: false })).toBe(true)
    // A trackpad's scroll, and its pinch, which the browser marks with Ctrl
    expect(isWheelNotch(pixels(4))).toBe(false)
    expect(isWheelNotch(pixels(-30))).toBe(false)
    expect(isWheelNotch(pixels(100, true))).toBe(false)
  })

  test("a notch zooms as far as deck.gl's own wheel: about half a level", () => {
    expect(wheelZoom(100)).toBeCloseTo(0.548, 3)
    expect(wheelZoom(-100)).toBeCloseTo(-0.548, 3)
    // Three lines, 40 px each
    expect(wheelZoom(120)).toBeCloseTo(0.62, 2)
  })

  test("a notch eases over several frames and lands within 250 ms, no farther", () => {
    const frame = 1000 / 60
    const zooms = frames(10, 10.548, frame)
    expect(zooms.length - 1).toBeGreaterThanOrEqual(8)
    expect((zooms.length - 1) * frame).toBeLessThanOrEqual(250)
    // 98% of the way within four times the easing
    const settled = zooms[Math.ceil((4 * wheelEasing) / frame)]
    expect((settled - 10) / 0.548).toBeGreaterThan(0.98)
    // Always closer, never past the target
    for (let index = 1; index < zooms.length; index++) {
      expect(zooms[index]).toBeGreaterThan(zooms[index - 1])
      expect(zooms[index]).toBeLessThanOrEqual(10.548)
    }
  })

  test("a slow frame does not overshoot: it lands", () => {
    expect(easeZoom(10, 10.548, 400)).toBe(10.548)
  })
})
