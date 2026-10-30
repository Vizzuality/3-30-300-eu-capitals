import type { Sources } from "@/data/schemas"
import type { CapitalSlug } from "./capitals"
import { sourceDate, type SourceDate } from "./source-table"

/*
 * The capitals whose canopy height imagery was taken outside full leaf,
 * which probably lowers their results for the 3 trees and 30% rules (a
 * limit on the Methodology page). Which capitals is a judgement made from
 * the imagery's dates, so it is kept here, the one place to change it; the
 * months the page shows are always read from the release.
 */
export const leafOffImagery = {
  // All of the capital's imagery
  whole: ["valletta", "lisbon", "bucharest", "copenhagen", "ljubljana"],
  // Part of it
  part: ["madrid", "rome"],
} as const satisfies Record<string, ReadonlyArray<CapitalSlug>>

export type ImageryDates = {
  slug: CapitalSlug
  // Its months, when the imagery was taken within one year; a capital whose
  // imagery spans several years is named without them
  months: SourceDate | undefined
}

/**
 * The imagery dates of the given capitals, from the release's sources, in
 * the same order; a capital the release does not list is left out
 */
export function imageryDates(
  capitals: Sources["capitals"],
  slugs: ReadonlyArray<CapitalSlug>
): Array<ImageryDates> {
  return slugs.flatMap((slug) => {
    const sources = capitals[slug]
    if (!sources) {
      return []
    }
    const date = sourceDate(sources.canopy_height.date, "month")
    const withinOneYear =
      date.end === undefined ||
      date.end.getUTCFullYear() === date.start.getUTCFullYear()
    return [{ slug, months: withinOneYear ? date : undefined }]
  })
}
