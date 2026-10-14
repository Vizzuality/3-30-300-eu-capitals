import { describe, expect, test } from "vitest"

import { homeSearchSchema } from "@/lib/home-search"

const parse = (search: Record<string, unknown>) =>
  homeSearchSchema.parse(search)

describe("Home's address", () => {
  test("the ranking is open by default", () => {
    expect(parse({})).toEqual({ tab: "ranking" })
  })

  test("the A–Z list, or the ranking, when the address says so", () => {
    expect(parse({ tab: "az" })).toEqual({ tab: "az" })
    expect(parse({ tab: "ranking" })).toEqual({ tab: "ranking" })
  })

  test("a tab that does not exist opens the ranking", () => {
    for (const tab of ["AZ", "list", "", 1, null]) {
      expect(parse({ tab })).toEqual({ tab: "ranking" })
    }
  })

  test("the capital page's parameters are left out", () => {
    expect(parse({ tab: "az", building: 7, rule: 30 })).toEqual({ tab: "az" })
  })
})
