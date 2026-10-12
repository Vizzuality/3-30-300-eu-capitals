import { describe, expect, test } from "vitest"

import { tweenTransition } from "@/design/tween"

describe("the transition of a tween", () => {
  test("a token runs with its own spring or curve", () => {
    expect(
      tweenTransition("float", { reducedMotion: false, fades: true })
    ).toMatchObject({ type: "spring" })
    expect(
      tweenTransition("glide", { reducedMotion: false, fades: true })
    ).toEqual({ type: "tween", duration: 0.76, ease: [0.33, 0, 0.15, 1] })
  })

  test("a token with a range takes a duration within it", () => {
    expect(
      tweenTransition("draw", {
        duration: 900,
        reducedMotion: false,
        fades: true,
      })
    ).toMatchObject({ duration: 0.9 })
  })

  test("under reduced motion it is a fade of at most 280 ms", () => {
    expect(
      tweenTransition("glide", { reducedMotion: true, fades: true })
    ).toEqual({ type: "tween", duration: 0.28, ease: [0.4, 0, 0.2, 1] })
    expect(
      tweenTransition("draw", {
        duration: 160,
        reducedMotion: true,
        fades: true,
      })
    ).toMatchObject({ duration: 0.16 })
  })

  test("under reduced motion, with nothing to fade, the change is immediate", () => {
    expect(
      tweenTransition("glide", { reducedMotion: true, fades: false })
    ).toMatchObject({ duration: 0 })
  })
})
