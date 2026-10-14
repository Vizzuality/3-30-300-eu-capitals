import {
  canopyRadius,
  gridCell,
  parkArea,
  ruleThresholds,
  type Rule,
} from "@/lib/rules"

/*
 * The legend of each view of the map, in one legend language: a thing has
 * the same name and the same swatch shape in every view. Results are the
 * 0–3 chips, trees a dot, canopy a soft patch, parks a rectangle, lines a
 * short stroke (and the 500 m circle a ring). Only the colour follows the
 * map: canopy and the park are full green when they are a rule's evidence.
 * The legend lists only what the view shows, and never its context
 * (streets and their names, water, dimmed surroundings). Home has no
 * legend: its capitals carry their own labels.
 */

/** What the map shows, as far as the legend is concerned */
export type LegendView =
  | { view: "home" }
  | { view: "overview" }
  | { view: "street" }
  | { view: "building"; rule: Rule; facade: boolean }

/** How an entry is drawn */
export type LegendSwatch =
  // The four result colours with their figures, 0 to 3
  | { shape: "results" }
  // A tree's crown
  | { shape: "dot" }
  // Canopy: light as greenery, full green as evidence
  | { shape: "patch"; evidence: boolean }
  // A park: stippled as greenery, full green as evidence
  | { shape: "rectangle"; evidence: boolean }
  // A line: facades that see 3 trees (thicker when one is selected), or
  // the dotted walking route
  | { shape: "stroke"; line: "facades" | "facade" | "route" }
  // The 500 m circle
  | { shape: "ring" }

export type LegendLabel =
  | { key: "resultsPerSquare"; values: { cell: number } }
  | { key: "resultsPerBuilding" }
  | { key: "trees" }
  | { key: "canopy" }
  | { key: "parks"; values: { area: number } }
  | { key: "facades"; values: { trees: number } }
  | { key: "facadesTrees" }
  | { key: "facade" }
  | { key: "facadeTrees" }
  | { key: "circle"; values: { radius: number } }
  | { key: "route" }
  | { key: "park"; values: { area: number } }

export type LegendEntry = { swatch: LegendSwatch; label: LegendLabel }

const canopy = (evidence: boolean): LegendEntry => ({
  swatch: { shape: "patch", evidence },
  label: { key: "canopy" },
})

/** The entries of a view's legend, in order; none on Home */
export function legendEntries(view: LegendView): Array<LegendEntry> {
  switch (view.view) {
    case "home":
      return []
    case "overview":
      return [
        {
          swatch: { shape: "results" },
          label: { key: "resultsPerSquare", values: { cell: gridCell } },
        },
      ]
    case "street":
      // The greenery is drawn in three ways, so it has three entries
      return [
        {
          swatch: { shape: "results" },
          label: { key: "resultsPerBuilding" },
        },
        { swatch: { shape: "dot" }, label: { key: "trees" } },
        canopy(false),
        {
          swatch: { shape: "rectangle", evidence: false },
          label: { key: "parks", values: { area: parkArea } },
        },
      ]
    default:
      return buildingEntries(view.rule, view.facade)
  }
}

// Only the items of the active rule; a facade exists with rule 3 only
function buildingEntries(rule: Rule, facade: boolean): Array<LegendEntry> {
  switch (rule) {
    case 30:
      return [
        {
          swatch: { shape: "ring" },
          label: { key: "circle", values: { radius: canopyRadius } },
        },
        canopy(true),
      ]
    case 300:
      return [
        {
          swatch: { shape: "stroke", line: "route" },
          label: { key: "route" },
        },
        {
          swatch: { shape: "rectangle", evidence: true },
          label: { key: "park", values: { area: parkArea } },
        },
      ]
    default:
      return facade
        ? [
            {
              swatch: { shape: "stroke", line: "facade" },
              label: { key: "facade" },
            },
            { swatch: { shape: "dot" }, label: { key: "facadeTrees" } },
          ]
        : [
            {
              swatch: { shape: "stroke", line: "facades" },
              label: {
                key: "facades",
                values: { trees: ruleThresholds.trees },
              },
            },
            { swatch: { shape: "dot" }, label: { key: "facadesTrees" } },
          ]
  }
}

/** The legend's entry as text, in the visitor's language */
export function legendText(
  { label }: LegendEntry,
  t: (key: LegendLabel["key"], values?: Record<string, number>) => string
) {
  return "values" in label ? t(label.key, label.values) : t(label.key)
}
