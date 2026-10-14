import { describe, expect, test } from "vitest"

import { capitalSearchSchema } from "@/lib/capital-search"

const parse = (search: Record<string, unknown>) =>
  capitalSearchSchema.parse(search)

describe("the capital page's address", () => {
  test("nothing selected shows the 3 trees rule", () => {
    expect(parse({})).toEqual({ rule: 3 })
  })

  test("a building, its rule and its facade", () => {
    expect(parse({ building: 1204, rule: 30 })).toEqual({
      building: 1204,
      rule: 30,
    })
    expect(parse({ building: 1204, rule: 3, facade: 88 })).toEqual({
      building: 1204,
      rule: 3,
      facade: 88,
    })
    expect(parse({ building: 1, rule: 300 })).toEqual({
      building: 1,
      rule: 300,
    })
  })

  test("a building without a rule shows the 3 trees rule", () => {
    expect(parse({ building: 1204 })).toEqual({ building: 1204, rule: 3 })
    expect(parse({ building: 1204, facade: 88 })).toEqual({
      building: 1204,
      rule: 3,
      facade: 88,
    })
  })

  test("a rule that does not exist is the 3 trees rule", () => {
    expect(parse({ building: 1204, rule: 5 })).toEqual({
      building: 1204,
      rule: 3,
    })
    expect(parse({ building: 1204, rule: "30" })).toEqual({
      building: 1204,
      rule: 3,
    })
  })

  test("ids are whole numbers from 1, exact as 32-bit floats", () => {
    for (const id of [0, -3, 1.5, 2 ** 24 + 1, "abc", "12", null]) {
      expect(parse({ building: id, facade: id })).toEqual({ rule: 3 })
    }
    expect(parse({ building: 2 ** 24, facade: 2 ** 24 })).toEqual({
      building: 2 ** 24,
      rule: 3,
      facade: 2 ** 24,
    })
  })

  test("a rule or a facade without a building is dropped", () => {
    expect(parse({ rule: 300 })).toEqual({ rule: 3 })
    expect(parse({ facade: 88 })).toEqual({ rule: 3 })
    expect(parse({ building: "abc", rule: 30, facade: 88 })).toEqual({
      rule: 3,
    })
  })

  test("a facade only goes with the 3 trees rule", () => {
    expect(parse({ building: 1204, rule: 30, facade: 88 })).toEqual({
      building: 1204,
      rule: 30,
    })
    expect(parse({ building: 1204, rule: 300, facade: 88 })).toEqual({
      building: 1204,
      rule: 300,
    })
  })

  test("the area in view: west, south, east and north", () => {
    const at = "18.06,59.31,18.08,59.32"
    expect(parse({ at })).toEqual({ rule: 3, at })
    expect(parse({ building: 7, at })).toEqual({ building: 7, rule: 3, at })
    for (const invalid of [
      "18.06,59.31,18.08",
      "18.06,59.31,18.08,59.32,1",
      "18.08,59.31,18.06,59.32",
      "18.06,59.32,18.08,59.31",
      "18.06,59.31,190,59.32",
      "18.06,-91,18.08,59.32",
      "18.06,,18.08,59.32",
      "a,b,c,d",
      18.06,
    ]) {
      expect(parse({ at: invalid })).toEqual({ rule: 3 })
    }
  })

  test("other parameters are left out", () => {
    expect(parse({ building: 7, view: "street", tab: "az" })).toEqual({
      building: 7,
      rule: 3,
    })
  })
})
