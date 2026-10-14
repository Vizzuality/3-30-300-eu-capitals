import { describe, expect, test } from "vitest"

import { sourcesSchema } from "@/data/schemas"
import { mapAttribution, osmCopyright } from "@/lib/map-attribution"
import sourcesFile from "@fixtures/release/sources.json"

const { sources } = sourcesSchema.parse(sourcesFile)

describe("the map's attribution", () => {
  test("a capital: OpenStreetMap first, then the buildings and the canopy", () => {
    expect(mapAttribution("capital", sources)).toEqual([
      { id: "osm", url: "https://www.openstreetmap.org/copyright" },
      {
        id: "overture_buildings",
        url: "https://docs.overturemaps.org/attribution/",
      },
      {
        id: "canopy_height",
        url: "https://registry.opendata.aws/dataforgood-fb-forests/",
      },
    ])
  })

  test("Home: OpenStreetMap's outlines on Natural Earth's countries", () => {
    expect(mapAttribution("home", sources).map(({ id }) => id)).toEqual([
      "osm",
      "natural_earth",
    ])
  })

  test("sources sharing a credit are named once", () => {
    const ids = mapAttribution("capital", sources).map(({ id }) => id)

    expect(ids).not.toContain("osm_land_polygons")
  })

  test("a source with a credit of its own is named on its own", () => {
    const [osm, landPolygons, ...others] = sources
    const relicensed = {
      ...landPolygons,
      licence: "CC BY 4.0",
      licence_url: "https://creativecommons.org/licenses/by/4.0/",
    }

    expect(
      mapAttribution("capital", [osm, relicensed, ...others]).map(
        ({ id }) => id
      )
    ).toContain("osm_land_polygons")
  })

  test("OpenStreetMap's credit links to its copyright page", () => {
    const [osm, landPolygons, ...others] = sources
    const withoutOsm = [landPolygons, ...others].filter(
      (source) => source !== undefined
    )

    expect(mapAttribution("home", sources)[0].url).toBe(osmCopyright)
    // Named through its land polygons only, it still links there
    expect(mapAttribution("capital", withoutOsm)[0]).toEqual({
      id: "osm_land_polygons",
      url: osmCopyright,
    })
    expect(osm.url).toBe(osmCopyright)
  })

  test("a source missing from the release is left out", () => {
    const withoutNaturalEarth = sources.filter(
      (source) => source?.id !== "natural_earth"
    )

    expect(
      mapAttribution("home", withoutNaturalEarth).map(({ id }) => id)
    ).toEqual(["osm"])
  })

  test("sources the map is not drawn from are not named", () => {
    const ids = [
      ...mapAttribution("home", sources),
      ...mapAttribution("capital", sources),
    ].map(({ id }) => id)

    expect(ids).not.toContain("ghs_pop")
    expect(ids).not.toContain("wikidata")
  })
})
