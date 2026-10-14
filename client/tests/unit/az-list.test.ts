import { describe, expect, test } from "vitest"

import { capitalsSchema, type Capital, type Names } from "@/data/schemas"
import { locales } from "@/i18n/locales"
import { azList, foldForSearch, searchAz } from "@/lib/az-list"
import capitalsFile from "@fixtures/release/capitals.json"

const { capitals } = capitalsSchema.parse(capitalsFile)

/** The same name in every language, but for some */
const names = (name: string, others: Partial<Names> = {}): Names => ({
  ...(Object.fromEntries(locales.map((locale) => [locale, name])) as Names),
  ...others,
})

/** A capital with only what the list needs */
const capital = (
  slug: Capital["slug"],
  name: Names,
  local = name.en
): Pick<Capital, "slug" | "name" | "local_name" | "country"> => ({
  slug,
  name,
  local_name: local,
  country: { code: "EU", name: names("Europe") },
})

const slugs = (list: Array<{ capital: { slug: string } }>) =>
  list.map((entry) => entry.capital.slug)

const found = (search: string, locale = "en") =>
  slugs(searchAz(azList(capitals, locale), search))

describe("the A–Z list's order", () => {
  test("follows the alphabet of the visitor's language", () => {
    const list = [
      capital("zagreb", names("Zagreb")),
      capital("stockholm", names("Örebro")),
      capital("riga", names("Oslo")),
    ]

    // In Swedish, Ö is a letter of its own, after Z; in German, an O
    expect(slugs(azList(list, "sv"))).toEqual(["riga", "zagreb", "stockholm"])
    expect(slugs(azList(list, "de"))).toEqual(["stockholm", "riga", "zagreb"])
  })

  test("Czech puts Ch after H", () => {
    const list = [
      capital("prague", names("Hradec")),
      capital("paris", names("Chomutov")),
      capital("berlin", names("Brno")),
    ]

    expect(slugs(azList(list, "cs"))).toEqual(["berlin", "prague", "paris"])
    expect(slugs(azList(list, "en"))).toEqual(["berlin", "paris", "prague"])
  })

  test("sorts the names of the visitor's language", () => {
    const list = [
      capital("copenhagen", names("Copenhagen", { da: "København" })),
      capital("helsinki", names("Helsinki")),
    ]

    expect(slugs(azList(list, "en"))).toEqual(["copenhagen", "helsinki"])
    expect(slugs(azList(list, "da"))).toEqual(["helsinki", "copenhagen"])
  })
})

describe("the A–Z search", () => {
  test("names are compared without accents, case or punctuation", () => {
    expect(foldForSearch("København")).toBe("kobenhavn")
    expect(foldForSearch("București")).toBe("bucuresti")
    expect(foldForSearch("Łódź")).toBe("lodz")
    expect(foldForSearch("  Il-Belt   Valletta ")).toBe("il belt valletta")
    expect(foldForSearch("ΛΕΥΚΩΣΊΑ")).toBe("λευκωσια")
  })

  test("finds a capital by its local name, accents aside", () => {
    expect(found("Kobenhavn")).toEqual(["copenhagen"])
    expect(found("KØBENHAVN")).toEqual(["copenhagen"])
    expect(found("praha")).toEqual(["prague"])
    expect(found("Αθηνα")).toEqual(["athens"])
    expect(found("bucuresti")).toEqual(["bucharest"])
  })

  test("finds a capital by its country, in the visitor's language", () => {
    expect(found("Sweden")).toEqual(["stockholm"])
    expect(found("Schweden", "de")).toEqual(["stockholm"])
  })

  test("matches the start of a word, not the middle of one", () => {
    expect(found("belt")).toEqual(["valletta"])
    expect(found("il-belt v")).toEqual(["valletta"])
    expect(found("lands")).toEqual([])
    expect(found("ma")).toEqual(["madrid", "valletta"])
  })

  test("keeps the list's order, and finds all with an empty search", () => {
    expect(found("li")).toEqual(["lisbon", "vilnius"])
    expect(found("")).toHaveLength(capitals.length)
    expect(found("  ")).toHaveLength(capitals.length)
    expect(found("qx")).toEqual([])
  })
})
