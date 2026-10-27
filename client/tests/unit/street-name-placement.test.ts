import { describe, expect, test } from "vitest"

import {
  boxOfRect,
  boxesOverlap,
  placeStreetNames,
  type NameCandidate,
  type PlacementOptions,
} from "@/lib/street-name-placement"

// Places are given in pixels directly: longitude is x, latitude is y
const options = (more: Partial<PlacementOptions> = {}): PlacementOptions => ({
  project: (longitude, latitude) => [longitude, latitude],
  zoom: 16,
  size: { width: 960, height: 900 },
  height: 15,
  padding: 3,
  margin: 6,
  sameStreet: 220,
  inset: 2,
  obstacles: [],
  previous: new Set(),
  ...more,
})

const candidate = (
  key: string,
  more: Partial<NameCandidate> = {}
): NameCandidate => ({
  key,
  name: key,
  longitude: 480,
  latitude: 450,
  angle: 0,
  z: 16,
  length: 300,
  width: 80,
  rank: 5,
  streetLength: 500,
  ...more,
})

const keys = (
  candidates: Array<NameCandidate>,
  more?: Partial<PlacementOptions>
) =>
  placeStreetNames(candidates, options(more)).map(
    ({ candidate: placed }) => placed.key
  )

describe("street names that would meet", () => {
  test("the more important street keeps its name", () => {
    const main = candidate("Götgatan", { rank: 2 })
    const side = candidate("Repslagargatan", { rank: 5, latitude: 455 })
    expect(keys([side, main])).toEqual(["Götgatan"])
  })

  test("as important, the longer street keeps its name", () => {
    const long = candidate("Folkungagatan", { streetLength: 2000 })
    const short = candidate("Kapellgränd", { streetLength: 150, latitude: 455 })
    expect(keys([short, long])).toEqual(["Folkungagatan"])
  })

  test("names turned with their streets meet only where their rectangles do", () => {
    // A name across the map, and one turned upright beside its end, then
    // over it
    const across = candidate("Across", { angle: 0, longitude: 480 })
    const along = candidate("Along", {
      angle: 90,
      longitude: 480 + 60,
      latitude: 450,
    })
    expect(keys([across, along])).toEqual(["Across", "Along"])
    const crossing = candidate("Crossing", {
      angle: 90,
      longitude: 480 + 20,
      latitude: 450,
    })
    expect(keys([across, crossing])).toEqual(["Across"])
    // Turned 45°, past the end of the other: their upright bounds meet,
    // their rectangles do not
    const slanted = candidate("Slanted", {
      angle: 45,
      longitude: 480 + 80,
      latitude: 450 - 40,
    })
    expect(keys([across, slanted])).toEqual(["Across", "Slanted"])
  })

  test("a few pixels are kept around each name", () => {
    // Text boxes 15 px high, 3 px around each: 21 px apart is the least
    const a = candidate("A", { latitude: 450 })
    expect(keys([a, candidate("B", { latitude: 450 + 21.5 })])).toEqual([
      "A",
      "B",
    ])
    expect(keys([a, candidate("B", { latitude: 450 + 20 })])).toEqual(["A"])
  })
})

describe("where a name may go", () => {
  test("never over the map's controls", () => {
    const controls = boxOfRect({ left: 440, top: 430, right: 520, bottom: 470 })
    expect(keys([candidate("Götgatan")], { obstacles: [controls] })).toEqual([])
  })

  test("only where its street has room for it at the current zoom", () => {
    // 80 px of text and 6 px at each end: 92 px of street at least
    const name = candidate("Götgatan", { z: 16, length: 100 })
    expect(keys([name], { zoom: 16 })).toEqual(["Götgatan"])
    // Half a zoom out, the street is 71 px long on screen
    expect(keys([name], { zoom: 15.5 })).toEqual([])
    // Prepared for zoom 15, it has twice the room at zoom 16
    expect(keys([candidate("Götgatan", { z: 15, length: 50 })])).toEqual([
      "Götgatan",
    ])
  })

  test("inside the map, clear of its edges", () => {
    expect(keys([candidate("Götgatan", { longitude: 30 })])).toEqual([])
    expect(keys([candidate("Götgatan", { longitude: 960 - 30 })])).toEqual([])
    expect(keys([candidate("Götgatan", { longitude: 50 })])).toEqual([
      "Götgatan",
    ])
  })

  test("a street's name is repeated only far enough from its other names", () => {
    const first = candidate("Götgatan", { longitude: 200 })
    const near = { ...first, key: "near", longitude: 200 + 200 }
    const far = { ...first, key: "far", longitude: 200 + 240 }
    expect(keys([first, near])).toEqual(["Götgatan"])
    expect(keys([first, far])).toEqual(["Götgatan", "far"])
  })
})

describe("between two runs", () => {
  test("the names shown last time are kept first, so names do not jump", () => {
    const main = candidate("Götgatan", { rank: 2 })
    const side = candidate("Repslagargatan", { rank: 5, latitude: 455 })
    expect(
      keys([main, side], { previous: new Set(["Repslagargatan"]) })
    ).toEqual(["Repslagargatan"])
  })

  test("the same candidates give the same names, whatever their order", () => {
    const candidates = Array.from({ length: 40 }, (_, index) =>
      candidate(`Street ${index}`, {
        longitude: 100 + ((index * 97) % 760),
        latitude: 100 + ((index * 53) % 700),
        angle: ((index * 37) % 180) - 89,
        rank: 1 + (index % 8),
      })
    )
    const reversed = [...candidates]
    reversed.reverse()
    expect(keys(reversed)).toEqual(keys(candidates))
  })
})

describe("the names kept", () => {
  test("never overlap", () => {
    const candidates = Array.from({ length: 200 }, (_, index) =>
      candidate(`Street ${index}`, {
        longitude: 60 + ((index * 131) % 840),
        latitude: 40 + ((index * 71) % 820),
        angle: ((index * 29) % 180) - 89,
        width: 40 + ((index * 17) % 120),
        rank: 1 + (index % 8),
      })
    )
    const placed = placeStreetNames(candidates, options())
    expect(placed.length).toBeGreaterThan(10)
    for (const [index, a] of placed.entries()) {
      for (const b of placed.slice(index + 1)) {
        expect(boxesOverlap(a.box, b.box)).toBe(false)
      }
    }
  })
})
