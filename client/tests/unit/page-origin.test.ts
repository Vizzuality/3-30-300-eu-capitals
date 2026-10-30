import { describe, expect, test } from "vitest"

import {
  backTarget,
  homeOrigin,
  openedFrom,
  pageOriginOf,
  returnsByHistory,
} from "@/lib/page-origin"

describe("the page About or Methodology is opened from", () => {
  test("Home, with its tab", () => {
    expect(pageOriginOf({ pathname: "/en", search: {}, index: 0 })).toEqual({
      page: "home",
      search: { tab: "ranking" },
      index: 0,
    })
    expect(
      pageOriginOf({ pathname: "/de/", search: { tab: "az" }, index: 3 })
    ).toEqual({ page: "home", search: { tab: "az" }, index: 3 })
  })

  test("a capital, with its building, rule, facade and view", () => {
    const at = "18.03,59.31,18.05,59.32"

    expect(
      pageOriginOf({
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
      pageOriginOf({ pathname: "/fr/methodology", search: {}, index: 1 })
    ).toEqual({ page: "methodology", index: 1 })
  })

  test("About", () => {
    expect(
      pageOriginOf({ pathname: "/en/about", search: {}, index: 2 })
    ).toEqual({ page: "about", index: 2 })
  })

  test("an address that is no page is no origin", () => {
    for (const pathname of [
      "/en/about/more",
      "/en/capitals/atlantis",
      "/en/capitals",
      "/en/capitals/stockholm/more",
      "/en/methodology/more",
      "/en/unknown",
    ]) {
      expect(pageOriginOf({ pathname, search: {}, index: 1 })).toBeUndefined()
    }
  })
})

describe("the back link's target", () => {
  test("the origin kept in About's history entry", () => {
    expect(
      backTarget(
        { page: "capital", slug: "riga", search: {}, index: 4 },
        "about"
      )
    ).toEqual({
      page: "capital",
      slug: "riga",
      search: { rule: 3, at: undefined },
      index: 4,
    })
    expect(backTarget({ page: "methodology" }, "about")).toEqual({
      page: "methodology",
    })
  })

  test("its search parameters are checked like the page's own", () => {
    expect(
      backTarget({ page: "home", search: { tab: "map" } }, "about")
    ).toEqual({
      page: "home",
      search: { tab: "ranking" },
    })
    expect(
      backTarget(
        {
          page: "capital",
          slug: "riga",
          search: { building: 12, rule: 30, facade: 4 },
        },
        "about"
      )
    ).toMatchObject({ search: { building: 12, rule: 30, facade: undefined } })
  })

  test("Home, when About was opened directly or the origin is not valid", () => {
    for (const state of [
      undefined,
      null,
      {},
      { page: "about" },
      { page: "unknown" },
      { page: "capital", slug: "atlantis", search: {} },
      { page: "methodology", index: -1 },
    ]) {
      expect(backTarget(state, "about")).toEqual(homeOrigin)
    }
  })
})

describe("Methodology's back link", () => {
  test("leads to the page Methodology was opened from, About included", () => {
    expect(
      backTarget(
        { page: "home", search: { tab: "az" }, index: 2 },
        "methodology"
      )
    ).toEqual({ page: "home", search: { tab: "az" }, index: 2 })
    expect(backTarget({ page: "about", index: 1 }, "methodology")).toEqual({
      page: "about",
      index: 1,
    })
  })

  test("never to Methodology itself: Home instead", () => {
    expect(
      backTarget({ page: "methodology", index: 1 }, "methodology")
    ).toEqual(homeOrigin)
  })
})

describe("the origin written when a page is opened from the top bar", () => {
  const capital = {
    page: "capital",
    slug: "riga",
    search: { rule: 3, at: undefined },
    index: 3,
  } as const
  const methodology = { page: "methodology", index: 4 } as const
  const about = { page: "about", index: 5 } as const

  test("the page shown, whichever it is", () => {
    expect(openedFrom("methodology", capital, undefined)).toEqual(capital)
    expect(openedFrom("about", methodology, capital)).toEqual(methodology)
    expect(openedFrom("methodology", about, capital)).toEqual(about)
  })

  test("opened again from itself, the page it came from", () => {
    expect(openedFrom("methodology", methodology, capital)).toEqual(capital)
    expect(openedFrom("about", about, methodology)).toEqual(methodology)
  })

  test("never the page itself: none, so its back link leads to Home", () => {
    expect(openedFrom("about", about, about)).toBeUndefined()
    expect(openedFrom("about", undefined, undefined)).toBeUndefined()
  })
})

describe("going back through the history", () => {
  test("only when the page's entry comes right after its origin's", () => {
    const origin = { page: "methodology", index: 2 } as const

    expect(returnsByHistory(origin, 3)).toBe(true)
    expect(returnsByHistory(origin, 4)).toBe(false)
    expect(returnsByHistory(origin, 2)).toBe(false)
    expect(returnsByHistory(origin, undefined)).toBe(false)
    expect(returnsByHistory(homeOrigin, 1)).toBe(false)
  })
})
