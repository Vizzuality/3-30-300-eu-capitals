import messages from "@messages/en.json"
import { createTranslator } from "use-intl"
import { describe, expect, test } from "vitest"

import { legendEntries, legendText, type LegendView } from "@/lib/map-legend"
import { rules } from "@/lib/rules"

const t = createTranslator({ locale: "en", messages, namespace: "map.legend" })

const texts = (view: LegendView) =>
  legendEntries(view).map((entry) => legendText(entry, t))

const shapes = (view: LegendView) =>
  legendEntries(view).map(({ swatch }) => swatch)

const canopy = (view: LegendView) =>
  legendEntries(view).find(({ label }) => label.key === "canopy")?.swatch

describe("the legend of each view", () => {
  test("Home has none", () => {
    expect(legendEntries({ view: "home" })).toEqual([])
  })

  test("the city overview: the results per 10 m square", () => {
    expect(texts({ view: "overview" })).toEqual(["Rules met per 10 m square"])
    expect(shapes({ view: "overview" })).toEqual([{ shape: "results" }])
  })

  test("the street: the results per building, then the three kinds of greenery", () => {
    expect(texts({ view: "street" })).toEqual([
      "Rules met per building",
      "Trees",
      "Tree canopy (ground under tree crowns)",
      "Parks and forests (1 ha or more)",
    ])
    expect(shapes({ view: "street" })).toEqual([
      { shape: "results" },
      { shape: "dot" },
      { shape: "patch", evidence: false },
      { shape: "rectangle", evidence: false },
    ])
  })

  test("a selected building lists only the items of its active rule", () => {
    expect(texts({ view: "building", rule: 3, facade: false })).toEqual([
      "Facades that see 3 trees or more",
      "Trees seen from these facades",
    ])
    expect(texts({ view: "building", rule: 30, facade: false })).toEqual([
      "500 m around the building",
      "Tree canopy (ground under tree crowns)",
    ])
    expect(texts({ view: "building", rule: 300, facade: false })).toEqual([
      "Walking route",
      "Nearest park or forest (1 ha or more)",
    ])
  })

  test("a selected facade has its own entries, thicker than the facades'", () => {
    expect(texts({ view: "building", rule: 3, facade: true })).toEqual([
      "This facade",
      "Trees seen from this facade",
    ])
    expect(shapes({ view: "building", rule: 3, facade: true })[0]).toEqual({
      shape: "stroke",
      line: "facade",
    })
    expect(shapes({ view: "building", rule: 3, facade: false })[0]).toEqual({
      shape: "stroke",
      line: "facades",
    })
  })

  test("a facade exists only with rule 3", () => {
    for (const rule of [30, 300] as const) {
      expect(legendEntries({ view: "building", rule, facade: true })).toEqual(
        legendEntries({ view: "building", rule, facade: false })
      )
    }
  })

  test("one swatch shape per thing in every view, full green as evidence", () => {
    const views: Array<LegendView> = [
      { view: "overview" },
      { view: "street" },
      ...rules.flatMap((rule) =>
        [false, true].map((facade) => ({
          view: "building" as const,
          rule,
          facade,
        }))
      ),
    ]
    const byThing = new Map<string, Set<string>>()
    for (const view of views) {
      for (const { swatch, label } of legendEntries(view)) {
        // Trees are trees, whichever facade sees them
        const thing = /trees$/i.test(label.key) ? "trees" : label.key
        const shapesOf = byThing.get(thing) ?? new Set<string>()
        shapesOf.add(swatch.shape)
        byThing.set(thing, shapesOf)
      }
    }
    for (const shapesOf of byThing.values()) {
      expect(shapesOf.size).toBe(1)
    }

    expect(canopy({ view: "street" })).toEqual({
      shape: "patch",
      evidence: false,
    })
    expect(canopy({ view: "building", rule: 30, facade: false })).toEqual({
      shape: "patch",
      evidence: true,
    })
    expect(shapes({ view: "building", rule: 300, facade: false })[1]).toEqual({
      shape: "rectangle",
      evidence: true,
    })
  })
})
