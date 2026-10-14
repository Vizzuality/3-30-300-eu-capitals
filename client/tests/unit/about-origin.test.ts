import { describe, expect, test } from "vitest"

import {
  aboutBackTarget,
  aboutOriginOf,
  homeOrigin,
  returnsByHistory,
} from "@/lib/about-origin"

describe("the page About is opened from", () => {
  test("Home, with its tab", () => {
    expect(aboutOriginOf({ pathname: "/en", search: {}, index: 0 })).toEqual({
      page: "home",
      search: { tab: "ranking" },
      index: 0,
    })
    expect(
      aboutOriginOf({ pathname: "/de/", search: { tab: "az" }, index: 3 })
    ).toEqual({ page: "home", search: { tab: "az" }, index: 3 })
  })

  test("a capital, with its building, rule, facade and view", () => {
    const at = "18.03,59.31,18.05,59.32"

    expect(
      aboutOriginOf({
        pathname: "/en/capitals/stockholm",
        search: { building: 31947, rule: 30, at },
        index: 2,
      })
    ).toEqual({
      page: "capital",
      slug: "stockholm",
      search: { building: 31947, rule: 30, facade: undefined, at },
      index: 2,
    })
  })

  test("Methodology", () => {
    expect(
      aboutOriginOf({ pathname: "/fr/methodology", search: {}, index: 1 })
    ).toEqual({ page: "methodology", index: 1 })
  })

  test("About itself, or an address that is no page, is no origin", () => {
    for (const pathname of [
      "/en/about",
      "/en/capitals/atlantis",
      "/en/capitals",
      "/en/capitals/stockholm/more",
      "/en/methodology/more",
      "/en/unknown",
    ]) {
      expect(aboutOriginOf({ pathname, search: {}, index: 1 })).toBeUndefined()
    }
  })
})

describe("the back link's target", () => {
  test("the origin kept in About's history entry", () => {
    expect(
      aboutBackTarget({ page: "capital", slug: "riga", search: {}, index: 4 })
    ).toEqual({
      page: "capital",
      slug: "riga",
      search: { rule: 3, at: undefined },
      index: 4,
    })
    expect(aboutBackTarget({ page: "methodology" })).toEqual({
      page: "methodology",
    })
  })

  test("its search parameters are checked like the page's own", () => {
    expect(aboutBackTarget({ page: "home", search: { tab: "map" } })).toEqual({
      page: "home",
      search: { tab: "ranking" },
    })
    expect(
      aboutBackTarget({
        page: "capital",
        slug: "riga",
        search: { building: 12, rule: 30, facade: 4 },
      })
    ).toMatchObject({ search: { building: 12, rule: 30, facade: undefined } })
  })

  test("Home, when About was opened directly or the origin is not valid", () => {
    for (const state of [
      undefined,
      null,
      {},
      { page: "about" },
      { page: "capital", slug: "atlantis", search: {} },
      { page: "methodology", index: -1 },
    ]) {
      expect(aboutBackTarget(state)).toEqual(homeOrigin)
    }
  })
})

describe("going back through the history", () => {
  test("only when About's entry comes right after its origin's", () => {
    const origin = { page: "methodology", index: 2 } as const

    expect(returnsByHistory(origin, 3)).toBe(true)
    expect(returnsByHistory(origin, 4)).toBe(false)
    expect(returnsByHistory(origin, 2)).toBe(false)
    expect(returnsByHistory(origin, undefined)).toBe(false)
    expect(returnsByHistory(homeOrigin, 1)).toBe(false)
  })
})
