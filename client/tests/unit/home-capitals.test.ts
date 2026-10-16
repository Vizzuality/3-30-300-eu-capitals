import { describe, expect, test } from "vitest"

import { capitalsSchema, rankingSchema } from "@/data/schemas"
import type { CapitalSlug } from "@/lib/capitals"
import { capitalStep, homeCapitals, nameCharacters } from "@/map/home-capitals"
import capitalsFile from "@fixtures/release/capitals.json"
import rankingFile from "@fixtures/release/ranking.json"

const capitals = capitalsSchema.parse(capitalsFile).capitals
const ranking = rankingSchema.parse(rankingFile)

describe("the capitals of the Home map", () => {
  test("in the order of the ranking, with their rank and share", () => {
    const shown = homeCapitals(capitals, ranking, "en")

    expect(shown.map(({ slug }) => slug)).toEqual(
      ranking.capitals.map(({ slug }) => slug)
    )
    expect(shown.map(({ rank }) => rank)).toEqual(
      ranking.capitals.map(({ rank }) => rank)
    )
    expect(shown[0].share).toBe(ranking.capitals[0].shares.met[3])
  })

  test("named in the visitor's language", () => {
    const athens = capitals.find(({ slug }) => slug === "athens")
    if (!athens) {
      throw new Error("Athens is missing")
    }
    const named = {
      ...athens,
      name: { ...athens.name, de: "Athen", el: "Αθήνα" },
      country: {
        ...athens.country,
        name: { ...athens.country.name, de: "Griechenland" },
      },
    }

    const [german] = homeCapitals([named], ranking, "de")
    expect(german.name).toBe("Athen")
    expect(german.country).toBe("Griechenland")
    expect(homeCapitals([named], ranking, "el")[0].name).toBe("Αθήνα")
    // An unknown language reads English
    expect(homeCapitals([named], ranking, "xx")[0].name).toBe(athens.name.en)
  })

  test("without a ranking, in the release's order", () => {
    const shown = homeCapitals(capitals, undefined, "en")

    expect(shown.map(({ slug }) => slug)).toEqual(
      capitals.map(({ slug }) => slug)
    )
    expect(shown.map(({ rank }) => rank)).toEqual(
      capitals.map((_, index) => index + 1)
    )
    expect(shown[0].share).toBeUndefined()
  })

  test("a moved capital has a line back to its true position", () => {
    const [moved] = capitals
    const shown = homeCapitals(
      [{ ...moved, leader: [moved.centre[0] + 0.5, moved.centre[1]] }],
      ranking,
      "en"
    )

    expect(shown[0].leader).toEqual([
      moved.centre,
      [moved.centre[0] + 0.5, moved.centre[1]],
    ])
    expect(homeCapitals([moved], ranking, "en")[0].leader).toBeUndefined()
  })

  test("its name goes under its drawn outline, its label above", () => {
    for (const capital of homeCapitals(capitals, ranking, "en")) {
      expect(capital.bottom[1]).toBeLessThan(capital.display[1])
      expect(capital.top[1]).toBeGreaterThan(capital.display[1])
    }
  })

  test("the names' font holds each of their characters once", () => {
    // Latin, then Greek (whose α is not the Latin a), each once
    expect(nameCharacters(["Rīga", "Roma", "Αθήνα"])).toBe("RagmoīΑήαθν")
    expect(nameCharacters([])).toBe("")
  })
})

describe("Tab and Shift+Tab among the capitals", () => {
  const order: Array<CapitalSlug> = ["helsinki", "berlin", "nicosia"]

  test("Tab goes from the map to the first capital, then to the next", () => {
    expect(capitalStep(order, undefined, false)).toEqual({
      next: "helsinki",
      leaves: false,
    })
    expect(capitalStep(order, "helsinki", false)).toEqual({
      next: "berlin",
      leaves: false,
    })
  })

  test("Tab after the last capital leaves the map", () => {
    expect(capitalStep(order, "nicosia", false)).toEqual({
      next: undefined,
      leaves: true,
    })
  })

  test("Shift+Tab goes back, to the map itself from the first capital", () => {
    expect(capitalStep(order, "nicosia", true)).toEqual({
      next: "berlin",
      leaves: false,
    })
    expect(capitalStep(order, "helsinki", true)).toEqual({
      next: undefined,
      leaves: false,
    })
  })

  test("Shift+Tab from the map itself leaves it", () => {
    expect(capitalStep(order, undefined, true)).toEqual({
      next: undefined,
      leaves: true,
    })
  })

  test("with no capitals, or one no longer shown, Tab starts again", () => {
    expect(capitalStep([], undefined, false)).toEqual({
      next: undefined,
      leaves: true,
    })
    expect(capitalStep(order, "stockholm", false)).toEqual({
      next: "helsinki",
      leaves: false,
    })
  })
})
