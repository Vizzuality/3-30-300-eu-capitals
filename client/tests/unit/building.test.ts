import messages from "@messages/en.json"
import { createTranslator } from "use-intl"
import { describe, expect, test } from "vitest"

import type { EvidenceBuilding, FacadeAttributes } from "@/data/schemas"
import {
  percentDown,
  percentUp,
  residentsAmount,
  selectedBuilding,
  type BuildingRecord,
} from "@/lib/building"

describe("a building's figures", () => {
  test("its share seeing 3 trees is rounded up, so 50.1% never reads 50%", () => {
    expect(percentUp(0.501)).toBe(51)
    expect(percentUp(0.5)).toBe(50)
    expect(percentUp(0.534)).toBe(54)
    expect(percentUp(0.53)).toBe(53)
    expect(percentUp(0.001)).toBe(1)
    expect(percentUp(0)).toBe(0)
    expect(percentUp(1)).toBe(100)
  })

  test("its canopy is rounded down, so 29.9% never reads 30%", () => {
    expect(percentDown(0.299)).toBe(29)
    expect(percentDown(0.3)).toBe(30)
    expect(percentDown(0.29)).toBe(29)
    expect(percentDown(0.208)).toBe(20)
    expect(percentDown(0.009)).toBe(0)
  })

  test("its residents are a whole number, or fewer than one", () => {
    expect(residentsAmount(150.9)).toEqual({ amount: "about", residents: 151 })
    expect(residentsAmount(2.2)).toEqual({ amount: "about", residents: 2 })
    expect(residentsAmount(0.5)).toEqual({ amount: "about", residents: 1 })
    expect(residentsAmount(0.3)).toEqual({ amount: "few", residents: 0 })
    expect(residentsAmount(0)).toEqual({ amount: "none", residents: 0 })
  })

  test("its residents in words", () => {
    const t = createTranslator({ locale: "en", messages, namespace: "capital" })
    const say = (residents: number) =>
      t("building.label", residentsAmount(residents))
    expect(say(150.9)).toBe("Selected building · about 151 residents")
    expect(say(1.2)).toBe("Selected building · about 1 resident")
    expect(say(0.2)).toBe("Selected building · fewer than one resident")
    expect(say(0)).toBe("Selected building · no residents")
  })
})

const evidence: EvidenceBuilding = {
  rules: [1, 0, 1],
  residents: 40.4,
  share3: 0.501,
  canopy: 0.299,
  walk: 120,
  park: 7,
  route: [0, 1, 2],
  facades: {
    first: 100,
    seen: [[1, 2, 3], [4], [], [5, 6, 7, 8]],
    from: [[0, 0, 0], [1], [], [2, 2, 2, 2]],
  },
}

const facade = (
  sid: number,
  orient: FacadeAttributes["orient"],
  n: number
): FacadeAttributes => ({
  sid,
  b: 9,
  ok: n >= 3 ? 1 : 0,
  n,
  orient,
  res: 10.1,
})

const record: BuildingRecord = {
  id: 9,
  building: evidence,
  park: { name: "Vita bergen", kind: "park", ha: 7.9 },
  // In any order; the third facade is missing from the city tiles
  facades: [facade(103, "W", 4), facade(100, "N", 3), facade(101, "E", 1)],
}

describe("a selected building", () => {
  test("meets each rule as its evidence says", () => {
    expect(selectedBuilding(record).met).toEqual({
      3: true,
      30: false,
      300: true,
    })
  })

  test("counts its facades that see 3 trees or more", () => {
    expect(selectedBuilding(record).trees).toEqual({
      percent: 51,
      facades: 4,
      passing: 2,
    })
  })

  test("lists its facades in order, with the trees each one sees", () => {
    expect(selectedBuilding(record).facades).toEqual([
      {
        id: 100,
        orientation: "N",
        residents: { amount: "about", residents: 10 },
        trees: 3,
        met: true,
      },
      {
        id: 101,
        orientation: "E",
        residents: { amount: "about", residents: 10 },
        trees: 1,
        met: false,
      },
      {
        id: 103,
        orientation: "W",
        residents: { amount: "about", residents: 10 },
        trees: 4,
        met: true,
      },
    ])
  })

  test("has no facades when its walls are all shared", () => {
    const shared = {
      ...record,
      building: {
        ...evidence,
        share3: 0,
        facades: { first: null, seen: [], from: [] },
      },
      facades: [],
    }
    expect(selectedBuilding(shared).trees).toEqual({
      percent: 0,
      facades: 0,
      passing: 0,
    })
    expect(selectedBuilding(shared).facades).toEqual([])
  })

  test("walks to its park, stands next to one, or has no path to one", () => {
    expect(selectedBuilding(record).walk).toEqual({
      kind: "route",
      metres: 120,
      park: "Vita bergen",
    })
    const touching = {
      ...record,
      building: { ...evidence, walk: 0, route: null },
      park: { name: null, kind: "wood" as const, ha: 2 },
    }
    expect(selectedBuilding(touching).walk).toEqual({
      kind: "touching",
      metres: 0,
      park: null,
    })
    const unreachable = {
      ...record,
      building: { ...evidence, walk: null, park: null, route: null },
      park: null,
    }
    expect(selectedBuilding(unreachable).walk).toEqual({
      kind: "none",
      metres: 0,
      park: null,
    })
  })
})
