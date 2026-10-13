import { describe, expect, test } from "vitest"

import { capitalSearchSchema } from "@/lib/capital-search"

const parse = (search: Record<string, unknown>) =>
  capitalSearchSchema.parse(search)

describe("the capital page's address", () => {
  test("nothing selected", () => {
    expect(parse({})).toEqual({})
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

  test("a rule that does not exist is dropped", () => {
    expect(parse({ building: 1204, rule: 5 })).toEqual({ building: 1204 })
    expect(parse({ building: 1204, rule: "30" })).toEqual({ building: 1204 })
  })

  test("ids are whole numbers from 1, exact as 32-bit floats", () => {
    for (const id of [0, -3, 1.5, 2 ** 24 + 1, "abc", "12", null]) {
      expect(parse({ building: id, facade: id })).toEqual({})
    }
    expect(parse({ building: 2 ** 24, facade: 2 ** 24 })).toEqual({
      building: 2 ** 24,
      facade: 2 ** 24,
    })
  })

  test("other parameters are left out", () => {
    expect(parse({ building: 7, view: "street" })).toEqual({ building: 7 })
  })
})
