import { spring } from "motion"
import { describe, expect, test } from "vitest"

import { motionDetails, motionTokens, type SpringToken } from "@/design/tokens"
import {
  dampingRatio,
  squashShape,
  toCssCurve,
  toMotionSpring,
  toMotionTween,
  toReducedFade,
  transitions,
} from "@/design/tokens-motion"

const springTokens = Object.entries(motionTokens).flatMap(
  ([name, token]): Array<[string, SpringToken]> =>
    token.kind === "spring" ? [[name, token]] : []
)

/**
 * Runs the converted spring in Motion from 0 to 1 and measures its peak and
 * when it settles within 0.2% for good: what the visitor sees must match the
 * token's overshoot and duration
 */
function run(token: SpringToken) {
  const generator = spring({ keyframes: [0, 1], ...toMotionSpring(token) })
  let peak = 0
  let settledAt: number | undefined
  for (let time = 1; time <= 3000; time++) {
    const { value } = generator.next(time)
    peak = Math.max(peak, value)
    if (Math.abs(value - 1) >= 0.002) {
      settledAt = undefined
    } else {
      settledAt ??= time
    }
  }
  return { overshoot: peak - 1, settledAt: settledAt ?? Infinity }
}

describe("springs from duration and overshoot", () => {
  test("the damping ratio follows the overshoot", () => {
    // A ratio of √½ overshoots by e^−π
    expect(dampingRatio(Math.exp(-Math.PI))).toBeCloseTo(Math.SQRT1_2, 6)
    expect(dampingRatio(0.04)).toBeCloseTo(0.716, 3)
    expect(dampingRatio(0.03)).toBeCloseTo(0.745, 3)
    // More overshoot, less damping
    expect(dampingRatio(0.1)).toBeLessThan(dampingRatio(0.01))
  })

  test("a spring that does not overshoot is critically damped", () => {
    expect(dampingRatio(0)).toBe(1)
    expect(
      toMotionSpring({ kind: "spring", duration: 500, overshoot: 0 })
    ).toMatchObject({ bounce: 0 })
  })

  test("the bounce is what the damping ratio leaves of 1", () => {
    const { bounce } = toMotionSpring(motionTokens.press)
    expect(bounce).toBeCloseTo(1 - dampingRatio(0.04), 10)
    expect(bounce).toBeCloseTo(0.284, 3)
  })

  test("a longer spring has a longer visual duration", () => {
    expect(toMotionSpring(motionTokens.lift).visualDuration).toBeGreaterThan(
      toMotionSpring(motionTokens.press).visualDuration
    )
    expect(toMotionSpring(motionTokens.press).visualDuration).toBeCloseTo(
      0.223,
      3
    )
    expect(toMotionSpring(motionTokens.float).visualDuration).toBeCloseTo(
      0.408,
      3
    )
  })

  test.each(springTokens)(
    "%s overshoots and settles in Motion as documented",
    (_, token) => {
      const { overshoot, settledAt } = run(token)

      expect(overshoot).toBeGreaterThan(token.overshoot * 0.9)
      expect(overshoot).toBeLessThan(token.overshoot * 1.1)
      // The duration bounds the oscillations, so the spring settles by then,
      // a little earlier at most
      expect(settledAt).toBeLessThanOrEqual(token.duration)
      expect(settledAt).toBeGreaterThan(token.duration * 0.8)
    }
  )
})

describe("curves", () => {
  test("eased tokens become tweens in seconds along their curve", () => {
    expect(toMotionTween(motionTokens.glide)).toEqual({
      type: "tween",
      duration: 0.76,
      ease: [0.33, 0, 0.15, 1],
    })
  })

  test("tokens with a range accept a duration within it, and only there", () => {
    expect(toMotionTween(motionTokens.draw, 900).duration).toBe(0.9)
    expect(toMotionTween(motionTokens.draw, 2000).duration).toBe(1.1)
    expect(toMotionTween(motionTokens.draw, 100).duration).toBe(0.6)
    expect(toMotionTween(motionTokens.glide, 1000).duration).toBe(0.76)
  })

  test("the curve is copied, so Motion cannot change the token", () => {
    const { ease } = toMotionTween(motionTokens.fade)
    ease[0] = 1

    expect(motionTokens.fade.curve[0]).toBe(0.4)
  })

  test("curves can be written as CSS", () => {
    expect(toCssCurve(motionTokens.squash.curve)).toBe(
      "cubic-bezier(0.3, 0.7, 0.4, 1)"
    )
  })
})

describe("squashes", () => {
  test("a held squash reaches its shape in 80 ms along its curve", () => {
    expect(motionDetails.squashHeldScale).toEqual({ x: 1.04, y: 0.94 })
    // A full-width row grows by about as many pixels as a button
    expect(motionDetails.squashRowScale).toEqual({ x: 1.01, y: 0.94 })
    expect(transitions.squashHeld).toEqual({
      type: "tween",
      duration: 0.08,
      ease: [0.3, 0.7, 0.4, 1],
    })
  })

  test("a wobble lasts 340 ms along its curve", () => {
    expect(transitions.squash).toEqual({
      type: "tween",
      duration: 0.34,
      ease: [0.3, 0.7, 0.4, 1],
    })
  })

  test("a wobble passes through its keyframes, then rests", () => {
    expect(squashShape(0)).toEqual({ x: 1, y: 1 })
    expect(squashShape(0.3).x).toBeCloseTo(1.06, 10)
    expect(squashShape(0.3).y).toBeCloseTo(0.931, 10)
    expect(squashShape(0.6).x).toBeCloseTo(0.976, 10)
    expect(squashShape(0.6).y).toBeCloseTo(1.03, 10)
    expect(squashShape(1)).toEqual({ x: 1, y: 1 })
  })

  test("between keyframes, it goes in a straight line", () => {
    // Halfway from rest to the widest
    expect(squashShape(0.15).x).toBeCloseTo(1.03, 10)
    // Halfway from the widest to the narrowest
    expect(squashShape(0.45).x).toBeCloseTo(1.018, 10)
    expect(squashShape(0.45).y).toBeCloseTo(0.9805, 10)
  })

  test("progress outside the wobble is held at its ends", () => {
    expect(squashShape(-0.2)).toEqual({ x: 1, y: 1 })
    expect(squashShape(1.3)).toEqual({ x: 1, y: 1 })
  })
})

describe("every token as a Motion transition", () => {
  test("springs are springs and eased tokens are tweens", () => {
    expect(Object.keys(transitions)).toEqual(Object.keys(motionTokens))
    for (const [name, token] of Object.entries(motionTokens)) {
      expect(transitions[name as keyof typeof transitions].type).toBe(
        token.kind === "spring" ? "spring" : "tween"
      )
    }
  })
})

describe("reduced motion", () => {
  test("an animation becomes a fade of at most 280 ms along the Fade curve", () => {
    expect(toReducedFade(650)).toEqual({
      type: "tween",
      duration: 0.28,
      ease: [0.4, 0, 0.2, 1],
    })
  })

  test("a shorter animation keeps its own duration", () => {
    expect(toReducedFade(160).duration).toBe(0.16)
  })
})
