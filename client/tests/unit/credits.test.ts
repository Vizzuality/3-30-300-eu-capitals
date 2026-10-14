import { describe, expect, test } from "vitest"

import { sourcesSchema } from "@/data/schemas"
import { creditsOf } from "@/lib/credits"
import sourcesFile from "@fixtures/release/sources.json"

const { sources } = sourcesSchema.parse(sourcesFile)

describe("the data credits", () => {
  test("one per attribution and licence, in the release's order", () => {
    const credits = creditsOf(sources)

    expect(
      credits.map((credit) => credit.sources.map(({ name }) => name))
    ).toEqual([
      ["OpenStreetMap", "OpenStreetMap land polygons"],
      ["Overture Maps buildings"],
      ["Meta & WRI High Resolution Canopy Height Maps"],
      ["GHS-POP (Global Human Settlement Layer, population)"],
      ["Wikidata"],
      ["Natural Earth"],
    ])
    expect(credits[0]).toEqual({
      sources: [
        {
          name: "OpenStreetMap",
          url: "https://www.openstreetmap.org/copyright",
        },
        {
          name: "OpenStreetMap land polygons",
          url: "https://osmdata.openstreetmap.de/data/land-polygons.html",
        },
      ],
      attribution:
        "© OpenStreetMap contributors, available under the Open Database License",
      licence: {
        name: "ODbL 1.0",
        url: "https://opendatacommons.org/licenses/odbl/1-0/",
      },
    })
  })

  test("an attribution that only repeats the source's name is left out", () => {
    const wikidata = creditsOf(sources).at(-2)

    expect(wikidata?.attribution).toBeUndefined()
    expect(wikidata?.licence.name).toBe("CC0 1.0")
  })

  test("the same attribution under another licence is another credit", () => {
    const [osm] = sources
    const credits = creditsOf([
      osm,
      { ...osm, name: "Other", licence: "CC BY 4.0" },
    ])

    expect(credits).toHaveLength(2)
  })

  test("Natural Earth is credited with its own attribution", () => {
    expect(creditsOf(sources).at(-1)).toEqual({
      sources: [
        { name: "Natural Earth", url: "https://www.naturalearthdata.com/" },
      ],
      attribution: "Made with Natural Earth",
      licence: {
        name: "Public domain",
        url: "https://www.naturalearthdata.com/about/terms-of-use/",
      },
    })
  })
})

describe("the sources of a release", () => {
  test("Natural Earth may follow the six others, or be left out", () => {
    const withoutIt = { ...sourcesFile, sources: sources.slice(0, 6) }

    expect(sourcesSchema.parse(sourcesFile).sources).toHaveLength(7)
    expect(sourcesSchema.parse(withoutIt).sources).toHaveLength(6)
  })
})
