/**
 * The 3-30-300 rule: at least 3 trees in view from every home, at least 30%
 * tree canopy within 500 m of it, and a park or forest within a 300 m walk.
 * The thresholds as numbers, so the interface formats them in the visitor's
 * language ("30%", "30 %").
 */
export const ruleThresholds = {
  // Trees seen from the home's facades
  trees: 3,
  // Share of the land within 500 m covered by tree crowns
  canopy: 0.3,
  // Walk to the nearest park or forest, in metres
  parkDistance: 300,
} as const

/** The radius of the area whose canopy counts for rule 30, in metres */
export const canopyRadius = 500

/** The smallest green space that counts for rule 300, in hectares */
export const parkArea = 1

/**
 * The three rules, by the figure that names them in the switcher
 * (3 · 30 · 300). A selected building shows the evidence of one at a time,
 * the 3 trees rule first.
 */
/** The side of a square of the grid every result is computed on, in metres */
export const gridCell = 10

export const rules = [3, 30, 300] as const

export type Rule = (typeof rules)[number]

/** The rule a selected building opens with */
export const defaultRule: Rule = 3
