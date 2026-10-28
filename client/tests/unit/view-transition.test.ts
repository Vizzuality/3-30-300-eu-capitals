import { describe, expect, test } from "vitest"

import { capitalsSchema } from "@/data/schemas"
import { motionTokens } from "@/design/tokens"
import { homeCapitals } from "@/map/home-capitals"
import {
  capitalOf,
  eased,
  grownOrigin,
  grownScale,
  leavingDuration,
  rippleShares,
  springAt,
  transitionKind,
  trueArea,
} from "@/map/view-transition"
import capitalsFile from "@fixtures/release/capitals.json"

const capitals = homeCapitals(
  capitalsSchema.parse(capitalsFile).capitals,
  null,
  "en"
)
const capital = (slug: string) => {
  const found = capitals.find((shown) => shown.slug === slug)
  if (!found) {
    throw new Error(`No ${slug} in the stand-in release`)
  }
  return found
}

describe("the transitions between the map's places", () => {
  test("from Home a capital opens, from a capital another, or Home", () => {
    expect(transitionKind("home", "capital:berlin")).toBe("open")
    expect(transitionKind("capital:berlin", "capital:rome")).toBe("switch")
    expect(transitionKind("capital:berlin", "home")).toBe("back")
  })

  test("the same place is no transition", () => {
    expect(transitionKind("home", "home")).toBeUndefined()
    expect(transitionKind("capital:rome", "capital:rome")).toBeUndefined()
  })

  test("a place's capital", () => {
    expect(capitalOf("capital:stockholm")).toBe("stockholm")
    expect(capitalOf("home")).toBeUndefined()
  })

  test("the city left sinks with the Sink token, or fades in 280 ms", () => {
    expect(leavingDuration(false)).toBe(motionTokens.sink.duration)
    expect(leavingDuration(true)).toBe(280)
  })
})

describe("the motion of the transitions", () => {
  test("a curve runs from 0 to 1, and stays there outside", () => {
    const { curve } = motionTokens.sink
    expect(eased(curve, 0)).toBe(0)
    expect(eased(curve, 1)).toBe(1)
    expect(eased(curve, -1)).toBe(0)
    expect(eased(curve, 2)).toBe(1)
    // Sink eases in: slow at first
    expect(eased(curve, 0.5)).toBeLessThan(0.5)
  })

  test("a spring overshoots by its token's overshoot, and settles in its duration", () => {
    const { lift } = motionTokens
    expect(springAt(lift, 0)).toBe(0)
    expect(springAt(lift, -100)).toBe(0)
    let peak = 0
    for (let time = 0; time <= lift.duration; time += 1) {
      peak = Math.max(peak, springAt(lift, time))
    }
    expect(peak - 1).toBeCloseTo(lift.overshoot, 3)
    expect(Math.abs(springAt(lift, lift.duration) - 1)).toBeLessThan(0.002)
  })

  test("the ripple starts at the capital chosen and ends at the farthest", () => {
    const from = capital("berlin")
    const shares = rippleShares(capitals, from.display)

    expect(shares.get("berlin")).toBe(0)
    expect(Math.max(...shares.values())).toBe(1)
    // Prague, next door, goes well before Lisbon, across Europe
    expect(shares.get("prague")).toBeLessThan(shares.get("lisbon") ?? 0)
  })
})

describe("the capital growing into its city", () => {
  test("it keeps its Home size on screen, then grows with the map", () => {
    const { scale } = capital("valletta")
    const home = 3.7

    expect(grownScale(scale, home, home)).toBe(scale)
    // One zoom level in, half as enlarged: the same size on screen
    expect(grownScale(scale, home, home + 1)).toBeCloseTo(scale / 2, 9)
    // Past its true size, it grows with the map
    expect(grownScale(scale, home, home + Math.log2(scale) + 2)).toBe(1)
  })

  test("it moves from where Home shows it to where the city is", () => {
    const shown = {
      display: [10, 50] as [number, number],
      centre: [12, 52] as [number, number],
      scale: 5,
    }

    expect(grownOrigin(shown, 5)).toEqual([10, 50])
    expect(grownOrigin(shown, 3)).toEqual([11, 51])
    expect(grownOrigin(shown, 1)).toEqual([12, 52])
  })

  test("an outline drawn at its true size is where the city is", () => {
    const shown = { display: [10, 50] as [number, number], scale: 1 }

    expect(grownOrigin({ ...shown, centre: [12, 52] }, 1)).toEqual([12, 52])
  })

  test("the camera heads for the outline at its true size, around the city", () => {
    const stockholm = capital("stockholm")
    const area = trueArea(stockholm)

    expect(area.west).toBeLessThan(stockholm.centre[0])
    expect(area.east).toBeGreaterThan(stockholm.centre[0])
    expect(area.south).toBeLessThan(stockholm.centre[1])
    expect(area.north).toBeGreaterThan(stockholm.centre[1])
    // Stockholm is about 30 km across, not the 230 km Home enlarges it to
    const widthKm =
      (area.east - area.west) *
      111.32 *
      Math.cos((stockholm.centre[1] * Math.PI) / 180)
    expect(widthKm).toBeGreaterThan(15)
    expect(widthKm).toBeLessThan(60)
  })
})
