import { describe, expect, test } from "vitest"

import capitalsFile from "@fixtures/release/capitals.json"
import rankingFile from "@fixtures/release/ranking.json"
import sourcesFile from "@fixtures/release/sources.json"

import {
  capitalsSchema,
  rankingSchema,
  sourcesSchema,
  summarySchema,
} from "@/data/schemas"
import { locales } from "@/i18n/locales"
import { capitalSlugs } from "@/lib/capitals"
import {
  buildStandIn,
  homeScale,
  onlyCapitals,
  parsePath,
  placeholderOutline,
  placeholderShares,
  standInRealCapitals,
  type ReferenceRow,
} from "@scripts/stand-in/build"
import referenceFile from "@scripts/stand-in/reference-capitals.json"

const ranking = rankingSchema.parse(rankingFile)
const capitals = capitalsSchema.parse(capitalsFile)
const sources = sourcesSchema.parse(sourcesFile)
const reference = referenceFile as ReferenceRow[]

// The summaries, by the name of their folder
const summaryFiles = new Map(
  Object.entries(
    import.meta.glob<unknown>("@fixtures/release/capitals/*/summary.json", {
      eager: true,
      import: "default",
    })
  ).map(([path, file]) => [path.split("/").at(-2), file])
)
const summary = (slug: string) => summarySchema.parse(summaryFiles.get(slug))

const only = <T extends { slug: string }>(rows: T[]) =>
  rows.filter(({ slug }) => slug === "stockholm")

/** A real release holding Stockholm only, as the first pipeline release */
function stockholmRelease() {
  return {
    ranking: {
      ...ranking,
      release: "2026-10-stockholm",
      complete: false,
      capitals: only(ranking.capitals).map((row) => ({ ...row, rank: 1 })),
    },
    capitals: {
      ...capitals,
      release: "2026-10-stockholm",
      complete: false,
      capitals: only(capitals.capitals),
    },
    sources: { ...sources, release: "2026-10-stockholm" },
    summaries: [{ ...summary("stockholm"), release: "2026-10-stockholm" }],
  }
}

/** Area of a ring (shoelace formula) */
function ringArea(ring: Array<[number, number]>) {
  let sum = 0
  ring.forEach(([x0, y0], i) => {
    const [x1, y1] = ring[(i + 1) % ring.length]
    sum += x0 * y1 - x1 * y0
  })
  return Math.abs(sum / 2)
}

describe("the 27 capitals", () => {
  test("the stand-in release holds exactly the capitals of the site", () => {
    const slugs = new Set<string>(capitalSlugs)
    const folders = [...summaryFiles.keys()]

    expect(ranking.capitals).toHaveLength(27)
    expect(new Set(ranking.capitals.map(({ slug }) => slug))).toEqual(slugs)
    expect(capitals.capitals).toHaveLength(27)
    expect(new Set(capitals.capitals.map(({ slug }) => slug))).toEqual(slugs)
    expect(folders).toHaveLength(27)
    expect(new Set(folders)).toEqual(slugs)
    for (const slug of capitalSlugs) {
      expect(summary(slug).slug).toBe(slug)
    }
  })
})

describe("placeholder figures", () => {
  test("the shares meeting 0 to 3 rules, from the percentages meeting 3 to 0", () => {
    expect(placeholderShares([30, 35, 25, 10]).met).toEqual([
      0.1, 0.25, 0.35, 0.3,
    ])
  })

  test("percentages that do not add up to 100 are scaled to", () => {
    const { met } = placeholderShares([22, 38, 30, 11])

    expect(met.reduce((sum, share) => sum + share)).toBeCloseTo(1, 3)
    expect(met[3]).toBe(0.2178)
  })

  test("every rule gets the average number of rules met, over three", () => {
    const { met, rules } = placeholderShares([30, 35, 25, 10])

    expect(rules).toEqual({ "3": 0.6167, "30": 0.6167, "300": 0.6167 })
    expect(rules["3"]).toBeGreaterThanOrEqual(met[3])
    expect(rules["3"]).toBeLessThanOrEqual(1 - met[0])
  })
})

describe("placeholder outlines", () => {
  test("an SVG path becomes one ring per polygon", () => {
    expect(parsePath("M1 2l3 0 0 4zM10 10l1-1 1.5.5z")).toEqual([
      [
        [1, 2],
        [4, 2],
        [4, 6],
      ],
      [
        [10, 10],
        [11, 9],
        [12.5, 9.5],
      ],
    ])
  })

  test("in metres from its centre, y north, closed, with the city's area", () => {
    // A 10 × 20 rectangle, its top edge at y = 0 in SVG coordinates
    const outline = placeholderOutline("M0 0l10 0 0 20-10 0z", 2)

    expect(outline).toHaveLength(1)
    const [ring] = outline[0]
    expect(ring).toHaveLength(5)
    expect(ring.at(-1)).toEqual(ring[0])
    // 2 km × 2 km = 4 km², centred on the rectangle's centre
    expect(ringArea(ring)).toBeCloseTo(4_000_000, -3)
    expect(ring[0][0]).toBeCloseTo(-707.1, 1)
    // The SVG's top edge is the northern one
    expect(ring[0][1]).toBeCloseTo(1414.2, 1)
  })
})

describe("placeholder enlargements on the Home map", () => {
  test("as the pipeline computes them: Stockholm's own size and latitude give its scale", () => {
    const real = capitals.capitals.find(({ slug }) => slug === "stockholm")

    expect(real?.scale).toBe(7.704)
    expect(homeScale(14.46, 59.321574)).toBe(7.704)
  })

  test("the smaller the city, the more it is enlarged", () => {
    expect(homeScale(1, 50)).toBeGreaterThan(homeScale(10, 50))
  })

  test("placeholders stay where they are, with no leader line", () => {
    const placeholders = capitals.capitals.filter(
      ({ placeholder }) => placeholder
    )

    expect(placeholders).toHaveLength(26)
    for (const capital of placeholders) {
      expect(capital.display).toEqual(capital.centre)
      expect(capital.leader).toBeNull()
    }
  })
})

describe("a real release cut down to Stockholm", () => {
  test("keeps its rows, ranked again, and its sources", () => {
    const real = stockholmRelease()
    // Another capital next to Stockholm, as in a complete release
    const berlin = {
      ...real.ranking.capitals[0],
      slug: "berlin" as const,
      rank: 1,
    }
    const release = {
      ...real,
      ranking: {
        ...real.ranking,
        complete: true,
        capitals: [berlin, { ...real.ranking.capitals[0], rank: 2 }],
      },
      sources: {
        ...real.sources,
        capitals: {
          ...real.sources.capitals,
          berlin: real.sources.capitals.stockholm,
        },
      },
    }
    const cut = onlyCapitals(release, standInRealCapitals)

    expect(cut.ranking.complete).toBe(false)
    expect(cut.ranking.capitals.map(({ slug, rank }) => [slug, rank])).toEqual([
      ["stockholm", 1],
    ])
    expect(Object.keys(cut.sources.capitals)).toEqual(["stockholm"])
    expect(cut.sources.sources).toEqual(real.sources.sources)
  })
})

describe("the stand-in release", () => {
  const built = buildStandIn(stockholmRelease(), reference, "stand-in")

  test("matches the committed one (run `pnpm stand-in` after a change)", () => {
    expect(built.ranking).toEqual(ranking)
    expect(built.capitals).toEqual(capitals)
    expect(built.sources).toEqual(sources)
    for (const builtSummary of built.summaries) {
      expect(builtSummary).toEqual(summary(builtSummary.slug))
    }
  })

  test("Natural Earth is credited, also from a release without it", () => {
    const real = stockholmRelease()
    const withoutIt = {
      ...real,
      sources: {
        ...real.sources,
        sources: real.sources.sources.slice(0, 6) as typeof sources.sources,
      },
    }
    const rebuilt = buildStandIn(withoutIt, reference, "stand-in")

    expect(rebuilt.sources.sources).toHaveLength(7)
    expect(rebuilt.sources.sources[6]).toEqual(sources.sources[6])
    expect(sources.sources[6]?.id).toBe("natural_earth")
  })

  test("a real capital is copied as it is, under the stand-in's name", () => {
    const real = stockholmRelease()
    const row = built.ranking.capitals.find(({ slug }) => slug === "stockholm")
    const { rank: _rank, ...realRow } = real.ranking.capitals[0]

    expect(row).toMatchObject(realRow)
    expect(row?.placeholder).toBeUndefined()
    expect(built.capitals.capitals).toContainEqual(real.capitals.capitals[0])
    expect(built.summaries).toContainEqual({
      ...real.summaries[0],
      release: "stand-in",
    })
    expect(built.sources.capitals).toEqual(real.sources.capitals)
  })

  test("every other capital is a placeholder, named in English everywhere", () => {
    const placeholders = built.summaries.filter(
      ({ placeholder }) => placeholder
    )

    expect(placeholders).toHaveLength(26)
    const berlin = built.summaries.find(({ slug }) => slug === "berlin")
    expect(berlin?.placeholder).toBe(true)
    for (const locale of locales) {
      expect(berlin?.name[locale]).toBe("Berlin")
      expect(berlin?.country.name[locale]).toBe("Germany")
    }
    expect(
      built.capitals.capitals.filter(({ placeholder }) => placeholder)
    ).toHaveLength(26)
  })

  test("the ranking is ordered by the share meeting all three rules", () => {
    const rows = built.ranking.capitals

    expect(rows.map(({ rank }) => rank)).toEqual(
      Array.from({ length: 27 }, (_, index) => index + 1)
    )
    // Each row against the one before it
    const outOfOrder = rows.slice(1).filter((row, index) => {
      const previous = rows[index]
      const [before, after] = [previous.shares.met[3], row.shares.met[3]]
      return before < after || (before === after && previous.slug > row.slug)
    })
    expect(outOfOrder).toEqual([])
    expect(built.ranking.complete).toBe(true)
  })
})
