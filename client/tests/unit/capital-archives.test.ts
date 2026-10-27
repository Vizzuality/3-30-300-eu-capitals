import { describe, expect, test } from "vitest"

import {
  capitalArchives,
  cityTileArea,
  standInCityArea,
} from "@/map/capital-archives"

describe("the archives a capital's map draws from", () => {
  test("a real capital of a real release: every archive", () => {
    expect(capitalArchives({}, "2026-10-all")).toEqual({
      grid: true,
      context: true,
      city: true,
      evidence: true,
    })
  })

  test("a real capital of the stand-in release: its grid and overview water", () => {
    expect(capitalArchives({ slug: "helsinki" }, "stand-in")).toEqual({
      grid: true,
      context: true,
      city: false,
      evidence: false,
    })
  })

  test("Stockholm in the stand-in release: also its corner of the city map and evidence", () => {
    expect(capitalArchives({ slug: "stockholm" }, "stand-in")).toEqual({
      grid: true,
      context: true,
      city: true,
      evidence: true,
    })
  })

  test("a capital with placeholder figures: none", () => {
    for (const release of ["stand-in", "2026-10-all"]) {
      expect(capitalArchives({ placeholder: true }, release)).toEqual({
        grid: false,
        context: false,
        city: false,
        evidence: false,
      })
    }
  })
})

describe("where a capital's city map has tiles", () => {
  const bbox: [number, number, number, number] = [17.76, 59.23, 18.2, 59.43]

  test("the city and its 1 km band, in a real release", () => {
    const [west, south, east, north] = cityTileArea(
      { slug: "stockholm", bbox },
      "2026-10-all"
    ) as [number, number, number, number]
    // A kilometre is about 0.009° of latitude, and 0.0176° of longitude at 59.33°
    expect(bbox[1] - south).toBeCloseTo(0.009, 4)
    expect(north - bbox[3]).toBeCloseTo(0.009, 4)
    expect(bbox[0] - west).toBeCloseTo(0.01757, 4)
    expect(east - bbox[2]).toBeCloseTo(0.01757, 4)
  })

  test("the stand-in's corner of Stockholm: two zoom-14 tiles of Södermalm", () => {
    const area = standInCityArea()
    expect(cityTileArea({ slug: "stockholm", bbox }, "stand-in")).toEqual(area)
    const [west, south, east, north] = area
    expect(west).toBeCloseTo(18.0615, 4)
    expect(east).toBeCloseTo(18.1055, 4)
    expect(south).toBeCloseTo(59.3108, 4)
    expect(north).toBeCloseTo(59.322, 4)
  })

  test("none where the release has no city map", () => {
    expect(cityTileArea({ slug: "helsinki", bbox }, "stand-in")).toBeUndefined()
    expect(
      cityTileArea(
        { slug: "stockholm", bbox, placeholder: true },
        "2026-10-all"
      )
    ).toBeUndefined()
  })
})
