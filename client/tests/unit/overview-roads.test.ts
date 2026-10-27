import { describe, expect, test } from "vitest"

import { roadFade, roadFadeLevels, roadWidth } from "@/lib/overview-roads"
import { streetLevelWidth } from "@/lib/visible-area"

describe("roadWidth", () => {
  test("gives each class its width on the ground, wider for a dual carriageway", () => {
    const widths = (
      ["motorway", "trunk", "primary", "secondary", "tertiary"] as const
    ).map((roadClass) => [
      roadWidth(roadClass, { dual: false, casing: false }).metres,
      roadWidth(roadClass, { dual: true, casing: false }).metres,
    ])
    expect(widths).toEqual([
      [12, 28],
      [10, 24],
      [9, 20],
      [8, 16],
      [7, 13],
    ])
  })

  test("keeps each class at least as wide on screen as before, either carriageway", () => {
    expect(
      roadWidth("motorway", { dual: false, casing: false }).minPixels
    ).toBe(2)
    expect(roadWidth("motorway", { dual: true, casing: false }).minPixels).toBe(
      2
    )
    expect(
      roadWidth("tertiary", { dual: false, casing: false }).minPixels
    ).toBe(0.75)
  })

  test("widens the casing beyond the road on both sides", () => {
    const road = roadWidth("primary", { dual: true, casing: false })
    const casing = roadWidth("primary", { dual: true, casing: true })
    expect(casing.metres - road.metres).toBe(2)
    expect(casing.minPixels - road.minPixels).toBeCloseTo(1.2)
  })
})

describe("roadFade", () => {
  test("shows the roads fully from the fade's start outwards", () => {
    const start = streetLevelWidth * 2 ** roadFadeLevels
    expect(roadFade(start)).toBe(1)
    expect(roadFade(start * 8)).toBe(1)
  })

  test("hides the roads at the street level and closer", () => {
    expect(roadFade(streetLevelWidth)).toBe(0)
    expect(roadFade(streetLevelWidth / 2)).toBe(0)
  })

  test("fades with the zoom, halfway at half the fade's levels", () => {
    expect(roadFade(streetLevelWidth * 2 ** (roadFadeLevels / 2))).toBeCloseTo(
      0.5
    )
  })

  test("shows the roads while the width in view is unknown", () => {
    expect(roadFade(0)).toBe(1)
    expect(roadFade(Number.NaN)).toBe(1)
  })
})
