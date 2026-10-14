import { describe, expect, test } from "vitest"

import type { BuildingRecord } from "@/lib/building"
import { capitalSearchSchema } from "@/lib/capital-search"
import { capitalView, guideInput } from "@/lib/capital-view"
import { guideState } from "@/lib/guide"
import { groundWidth, parseVisibleArea } from "@/lib/visible-area"

const search = (params: Record<string, unknown>) =>
  capitalSearchSchema.parse(params)

// About 1.1 km and 2.3 km across, on Södermalm
const street = "18.06,59.312,18.08,59.318"
const wider = "18.04,59.30,18.08,59.33"

const record: BuildingRecord = {
  id: 31947,
  building: {
    rules: [1, 0, 0],
    residents: 150.9,
    share3: 0.534,
    canopy: 0.208,
    walk: 361,
    park: 711,
    route: [1, 2],
    facades: { first: 102279, seen: [[1, 2, 3, 4], [5]], from: [[], []] },
  },
  park: { name: "Vita bergen", kind: "park", ha: 7.9 },
  facades: [
    { sid: 102279, b: 31947, ok: 1, n: 4, orient: "NW", res: 19.6 },
    { sid: 102280, b: 31947, ok: 0, n: 1, orient: "SW", res: 8.4 },
  ],
}

/** The guide's state for an address */
const state = (params: Record<string, unknown>) =>
  guideState(guideInput(capitalView(search(params), record)))

describe("the area in view", () => {
  test("is measured on the ground, at its middle latitude", () => {
    const area = parseVisibleArea(street)
    expect(area).toBeDefined()
    expect(groundWidth(area!)).toBeCloseTo(1_138, -1)
    expect(groundWidth(parseVisibleArea(wider)!)).toBeCloseTo(2_276, -1)
  })
})

describe("what a capital's page shows", () => {
  test("the city overview as it opens", () => {
    expect(capitalView(search({}), undefined)).toEqual({ view: "overview" })
  })

  test("the street once the area in view is narrower than 1.5 km", () => {
    expect(capitalView(search({ at: street }), undefined)).toEqual({
      view: "street",
    })
    expect(capitalView(search({ at: wider }), undefined)).toEqual({
      view: "overview",
    })
  })

  test("a building the map knows, with its rule", () => {
    const view = capitalView(
      search({ building: 31947, rule: 300, at: wider }),
      record
    )
    expect(view).toMatchObject({
      view: "building",
      building: { id: 31947 },
      rule: 300,
    })
    expect(view.view === "building" && view.facade).toBeUndefined()
  })

  test("one of its facades, with the 3 trees rule", () => {
    const view = capitalView(
      search({ building: 31947, facade: 102280 }),
      record
    )
    expect(view).toMatchObject({
      view: "building",
      rule: 3,
      facade: { id: 102280, orientation: "SW", trees: 1, met: false },
    })
  })

  test("a facade of another building is left out", () => {
    const view = capitalView(search({ building: 31947, facade: 5 }), record)
    expect(view).toMatchObject({ view: "building", rule: 3 })
    expect(view.view === "building" && view.facade).toBeUndefined()
  })

  test("a building the map does not know is left out", () => {
    expect(capitalView(search({ building: 12 }), undefined)).toEqual({
      view: "overview",
    })
    expect(
      capitalView(search({ building: 12, at: street }), { ...record, id: 13 })
    ).toEqual({ view: "street" })
  })

  test("the guide follows it", () => {
    expect(state({})).toBe("overview")
    expect(state({ at: street })).toBe("street")
    expect(state({ building: 31947 })).toBe("building")
    expect(state({ building: 31947, facade: 102279 })).toBe("facade")
    expect(state({ building: 31947, facade: 5 })).toBe("building")
    expect(state({ building: 31947, rule: 30 })).toBe("explore")
    expect(state({ building: 12 })).toBe("overview")
  })
})
