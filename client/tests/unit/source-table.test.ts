import { describe, expect, test } from "vitest"

import { sourcesSchema } from "@/data/schemas"
import { sourceDate, sourceRows, sourceVersion } from "@/lib/source-table"
import sourcesFile from "@fixtures/release/sources.json"

const { sources } = sourcesSchema.parse(sourcesFile)
const [osm] = sources

const utc = (value: string) => new Date(value)

describe("the data table", () => {
  test("one row per kind of data, each with its source", () => {
    expect(sourceRows(sources).map(({ row, name }) => [row, name])).toEqual([
      ["boundaries", "OpenStreetMap"],
      ["coastline", "OpenStreetMap land polygons"],
      ["water", "OpenStreetMap"],
      ["trees", "Meta & WRI High Resolution Canopy Height Maps"],
      ["buildings", "Overture Maps buildings"],
      ["greenSpaces", "OpenStreetMap"],
      ["walking", "OpenStreetMap"],
      ["population", "GHS-POP (Global Human Settlement Layer, population)"],
      ["placeNames", "Wikidata"],
      ["countries", "Natural Earth"],
    ])
  })

  test("without the Home map, there is no row for its countries", () => {
    const rows = sourceRows(sources.slice(0, 6) as typeof sources)

    expect(rows.map(({ row }) => row)).not.toContain("countries")
    expect(rows).toHaveLength(9)
  })

  test("each row takes its source's version, date and licence", () => {
    const rows = sourceRows(sources)

    expect(rows.find(({ row }) => row === "buildings")).toEqual({
      row: "buildings",
      name: "Overture Maps buildings",
      version: { kind: "name", name: "2026-09-23.1" },
      date: { start: utc("2026-09-23T00:00:00Z"), precision: "month" },
      imagery: false,
      licence: "ODbL 1.0",
    })
    // The canopy height map: its imagery's dates, by year
    expect(rows.find(({ row }) => row === "trees")).toMatchObject({
      version: { kind: "name", name: "v1" },
      date: {
        start: utc("2014-08-04T00:00:00Z"),
        end: utc("2020-06-25T00:00:00Z"),
        precision: "year",
      },
      imagery: true,
      licence: "CC BY 4.0",
    })
    // The population's epoch, a year
    expect(rows.find(({ row }) => row === "population")?.date).toEqual({
      start: utc("2020-01-01T00:00:00Z"),
      precision: "year",
    })
    // No version
    expect(rows.find(({ row }) => row === "coastline")?.version).toBeUndefined()
  })
})

describe("a source's version", () => {
  test("OpenStreetMap's: the number of Geofabrik extracts read", () => {
    expect(sourceVersion(osm)).toEqual({ kind: "extracts", count: 45 })
    expect(
      sourceVersion({ ...osm, version: "Geofabrik europe/sweden-261011" })
    ).toEqual({ kind: "extracts", count: 1 })
  })

  test("any other, as the release writes it", () => {
    expect(sourceVersion({ ...osm, version: "OSM planet 2026-10-11" })).toEqual(
      { kind: "name", name: "OSM planet 2026-10-11" }
    )
  })

  test("none when the source has none", () => {
    expect(sourceVersion({ ...osm, version: null })).toBeUndefined()
  })
})

describe("a source's date", () => {
  test("a timestamp, in UTC", () => {
    expect(sourceDate("2026-10-11T20:21:06Z", "day")).toEqual({
      start: utc("2026-10-11T20:21:06Z"),
      precision: "day",
    })
  })

  test("an interval within what is shown of its start is one date", () => {
    expect(
      sourceDate("2026-10-12T13:39:04Z/2026-10-15T14:48:43Z", "month")
    ).toEqual({ start: utc("2026-10-12T13:39:04Z"), precision: "month" })
    expect(sourceDate("2020-06-12/2020-06-25", "year")).toEqual({
      start: utc("2020-06-12T00:00:00Z"),
      precision: "year",
    })
  })

  test("an interval that ends later than shown keeps its end", () => {
    expect(
      sourceDate("2026-10-12T13:39:04Z/2026-10-15T14:48:43Z", "day")
    ).toEqual({
      start: utc("2026-10-12T13:39:04Z"),
      end: utc("2026-10-15T14:48:43Z"),
      precision: "day",
    })
  })
})
