import { describe, expect, test } from "vitest"

import capitalsFile from "@fixtures/release/capitals.json"
import stockholmFile from "@fixtures/release/capitals/stockholm/summary.json"

import { capitalsSchema, summarySchema } from "@/data/schemas"

const stockholm = summarySchema.parse(stockholmFile)
const capitals = capitalsSchema.parse(capitalsFile)

/** Stockholm's summary with other OpenStreetMap sources */
function withOsm(osm: Record<string, unknown>) {
  return {
    ...stockholm,
    sources: {
      ...stockholm.sources,
      osm: { ...stockholm.sources.osm, ...osm },
    },
  }
}

/** The release's capitals, the first one changed */
function withFirstCapital(change: Record<string, unknown>) {
  const [first, ...rest] = capitals.capitals
  return { ...capitals, capitals: [{ ...first, ...change }, ...rest] }
}

describe("a capital's OpenStreetMap source", () => {
  test("several extracts, when the city crosses the edge of every region", () => {
    const version =
      "Geofabrik europe/slovakia-261011, europe/austria-261011, europe/hungary-261011"
    const parsed = summarySchema.parse(withOsm({ version }))

    expect(parsed.sources.osm.version).toBe(version)
  })

  test("relations cut out of the boundary's area are kept", () => {
    const subtracted = [{ relation: 3263909, relation_version: 166 }]
    const parsed = summarySchema.parse(withOsm({ subtracted }))

    expect(parsed.sources.osm.subtracted).toEqual(subtracted)
    expect(stockholm.sources.osm.subtracted).toBeUndefined()
  })

  test("a cut-out relation needs its pinned version", () => {
    const subtracted = [{ relation: 3263909 }]

    expect(summarySchema.safeParse(withOsm({ subtracted })).success).toBe(false)
  })
})

describe("the capitals on the Home map", () => {
  test("each has its enlargement and, when nudged, a leader line", () => {
    const leader = [24.748764, 60.264692]
    const parsed = capitalsSchema.parse(withFirstCapital({ leader }))

    expect(parsed.capitals[0].leader).toEqual(leader)
    expect(capitals.capitals.every(({ scale }) => scale > 0)).toBe(true)
  })

  test("the enlargement and the leader line are required", () => {
    expect(
      capitalsSchema.safeParse(withFirstCapital({ scale: undefined })).success
    ).toBe(false)
    expect(
      capitalsSchema.safeParse(withFirstCapital({ leader: undefined })).success
    ).toBe(false)
  })
})
