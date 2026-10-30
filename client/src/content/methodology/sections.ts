/*
 * The sections of the Methodology page, in order: the three rules, then
 * residents, city limits, the data and the limits. Each has its title in
 * `methodology.sections` and its place in the page's address (`#data`), for
 * the table of contents.
 */
export const methodologySections = [
  { key: "trees", id: "trees" },
  { key: "canopy", id: "canopy" },
  { key: "park", id: "park" },
  { key: "residents", id: "residents" },
  { key: "cityLimits", id: "city-limits" },
  { key: "data", id: "data" },
  { key: "limits", id: "limits" },
] as const

export type MethodologySection = (typeof methodologySections)[number]

export type MethodologySectionId = MethodologySection["id"]
