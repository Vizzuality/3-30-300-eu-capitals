import messages from "@messages/en.json"
import { createTranslator } from "use-intl"
import { describe, expect, test } from "vitest"

import {
  guideState,
  guideStates,
  guideText,
  pathDots,
  pulseOf,
  type GuideState,
} from "@/lib/guide"

const t = createTranslator({ locale: "en", messages, namespace: "guide" })

describe("the guide's state", () => {
  test("Home always starts the path", () => {
    expect(guideState({ page: "home" })).toBe("home")
  })

  test("a capital opens on its city overview", () => {
    expect(guideState({ page: "capital" })).toBe("overview")
    expect(guideState({ page: "capital", view: "overview" })).toBe("overview")
  })

  test("zoomed in to street level, with nothing selected", () => {
    expect(guideState({ page: "capital", view: "street" })).toBe("street")
  })

  test("a selected building shows rule 3 first", () => {
    expect(guideState({ page: "capital", building: 12 })).toBe("building")
    expect(guideState({ page: "capital", building: 12, rule: 3 })).toBe(
      "building"
    )
  })

  test("a selected building implies street level, whatever the view", () => {
    expect(
      guideState({ page: "capital", view: "overview", building: 12 })
    ).toBe("building")
  })

  test("a facade of the building, with rule 3", () => {
    expect(guideState({ page: "capital", building: 12, facade: 40 })).toBe(
      "facade"
    )
    expect(
      guideState({ page: "capital", building: 12, rule: 3, facade: 40 })
    ).toBe("facade")
  })

  test("rules 30 and 300 explore further", () => {
    expect(guideState({ page: "capital", building: 12, rule: 30 })).toBe(
      "explore"
    )
    expect(guideState({ page: "capital", building: 12, rule: 300 })).toBe(
      "explore"
    )
  })

  test("a facade counts only with rule 3", () => {
    expect(
      guideState({ page: "capital", building: 12, rule: 30, facade: 40 })
    ).toBe("explore")
    expect(
      guideState({ page: "capital", building: 12, rule: 300, facade: 40 })
    ).toBe("explore")
  })

  test("a rule or a facade without a building is the overview or the street", () => {
    expect(guideState({ page: "capital", rule: 30 })).toBe("overview")
    expect(guideState({ page: "capital", facade: 40 })).toBe("overview")
    expect(guideState({ page: "capital", view: "street", facade: 40 })).toBe(
      "street"
    )
  })
})

/*
 * Every row of the guide's table: the step label, the sentence with a mouse
 * and with a finger, and the path's dots
 */
const table: Record<
  GuideState,
  { label: string; click: string; tap: string; dots: Array<string> }
> = {
  home: {
    label: "Start here",
    click: "Click a capital on the map, or a row in the ranking",
    tap: "Tap a capital on the map, or a row in the ranking",
    dots: [],
  },
  overview: {
    label: "Next · 1 of 3",
    click: "Click anywhere on the map to zoom in on a street",
    tap: "Tap anywhere on the map to zoom in on a street",
    dots: ["current", "ahead", "ahead"],
  },
  street: {
    label: "Next · 2 of 3",
    click: "Click a building to see why it scores as it does",
    tap: "Tap a building to see why it scores as it does",
    dots: ["done", "current", "ahead"],
  },
  building: {
    label: "Next · 3 of 3",
    click:
      "Switch rules with 3 · 30 · 300, or click a facade to see the trees it sees",
    tap: "Switch rules with 3 · 30 · 300, or tap a facade to see the trees it sees",
    dots: ["done", "done", "current"],
  },
  facade: {
    label: "Facade selected",
    click: "Click the facade again to see the whole building",
    tap: "Tap the facade again to see the whole building",
    dots: ["done", "done", "current"],
  },
  explore: {
    label: "Explore",
    click:
      "Click another building to compare it, or press Esc to go back to the street",
    tap: "Tap another building to compare it",
    dots: ["done", "done", "current"],
  },
}

describe("the guide's text and path", () => {
  test.each(guideStates)("%s", (state) => {
    const { label, click, tap, dots } = table[state]

    expect(guideText(state, t)).toEqual({ label, sentence: { click, tap } })
    expect(pathDots(state)).toEqual(dots)
  })
})

describe("the guide's pulse on the map", () => {
  test("only where the next step is on the map itself", () => {
    expect(guideStates.map((state) => pulseOf(state))).toEqual([
      undefined,
      "overview",
      "street",
      undefined,
      undefined,
      undefined,
    ])
  })
})
