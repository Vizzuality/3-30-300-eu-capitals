import { describe, expect, test } from "vitest"

import {
  placePlaceNames,
  type PlaceLabel,
  type PlaceOptions,
} from "@/lib/place-name-placement"
import { boxOfRect } from "@/lib/street-name-placement"

// Places are given in pixels directly: longitude is x, latitude is y
const options = (more: Partial<PlaceOptions> = {}): PlaceOptions => ({
  project: (longitude, latitude) => [longitude, latitude],
  size: { width: 960, height: 900 },
  height: 14,
  padding: 16,
  obstacles: [],
  ...more,
})

const place = (key: string, more: Partial<PlaceLabel> = {}): PlaceLabel => ({
  key,
  text: key,
  longitude: 480,
  latitude: 450,
  tier: 1,
  rank: 1000,
  width: 60,
  ...more,
})

const keys = (labels: Array<PlaceLabel>, more?: Partial<PlaceOptions>) =>
  placePlaceNames(labels, options(more)).map(({ label }) => label.key)

describe("district names that would meet", () => {
  test("the districts come before the finer level, whatever their residents", () => {
    const district = place("Södermalm", { tier: 1, rank: 10 })
    const finer = place("Katarina", { tier: 2, rank: 90_000, latitude: 460 })
    expect(keys([finer, district])).toEqual(["Södermalm"])
  })

  test("within a level, the most residents first", () => {
    const small = place("Skrubba", { rank: 500 })
    const large = place("Farsta", { rank: 40_000, longitude: 500 })
    expect(keys([small, large])).toEqual(["Farsta"])
  })

  test("16 px are kept between names, no more is asked", () => {
    // Boxes 60 px wide: centres 76 px apart leave exactly 16 px, which
    // touches; one more pixel is clear
    const a = place("A", { longitude: 400 })
    expect(keys([a, place("B", { longitude: 477, rank: 1 })])).toEqual([
      "A",
      "B",
    ])
    expect(keys([a, place("B", { longitude: 475, rank: 1 })])).toEqual(["A"])
    // Above and below: 14 px high boxes, 30 px apart touch
    expect(
      keys([a, place("C", { longitude: 400, latitude: 481, rank: 1 })])
    ).toEqual(["A", "C"])
    expect(
      keys([a, place("C", { longitude: 400, latitude: 479, rank: 1 })])
    ).toEqual(["A"])
  })

  test("no count and no cap: every name that has room is written", () => {
    const grid = Array.from({ length: 60 }, (_, index) =>
      place(`P${index}`, {
        longitude: 60 + (index % 10) * 90,
        latitude: 40 + Math.floor(index / 10) * 40,
      })
    )
    expect(keys(grid)).toHaveLength(60)
  })
})

describe("where a name may go", () => {
  test("16 px clear of what lies over the map", () => {
    const legend = boxOfRect({ left: 16, top: 16, right: 280, bottom: 52 })
    // The box's top edge, 7 px above its centre, more than 16 px below the
    // legend
    expect(
      keys([place("A", { longitude: 150, latitude: 76 })], {
        obstacles: [legend],
      })
    ).toEqual(["A"])
    expect(
      keys([place("A", { longitude: 150, latitude: 75 })], {
        obstacles: [legend],
      })
    ).toEqual([])
  })

  test("inside the map", () => {
    expect(keys([place("A", { longitude: 20 })])).toEqual([])
    expect(keys([place("A", { longitude: 31 })])).toEqual(["A"])
    expect(keys([place("A", { latitude: 895 })])).toEqual([])
  })

  test("the same names give the same result, whatever their order", () => {
    const labels = Array.from({ length: 120 }, (_, index) =>
      place(`P${index}`, {
        longitude: 40 + ((index * 83) % 880),
        latitude: 30 + ((index * 47) % 840),
        tier: 1 + (index % 2),
        rank: (index * 7919) % 5000,
        width: 30 + ((index * 13) % 90),
      })
    )
    const reversed = [...labels]
    reversed.reverse()
    expect(keys(reversed)).toEqual(keys(labels))
  })
})

describe("why names are left out", () => {
  test("outside the map, on an overlay, or against a name already written", () => {
    const counts = { candidates: 0, outside: 0, overlay: 0, name: 0 }
    const legend = boxOfRect({ left: 16, top: 16, right: 280, bottom: 52 })
    placePlaceNames(
      [
        place("Written", { rank: 3 }),
        place("Against it", { rank: 2, longitude: 490 }),
        place("Under the legend", { longitude: 150, latitude: 40 }),
        place("Outside", { longitude: 5 }),
      ],
      options({ obstacles: [legend] }),
      counts
    )
    expect(counts).toEqual({ candidates: 4, outside: 1, overlay: 1, name: 1 })
  })
})
