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
