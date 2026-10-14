import type { Shares } from "@/data/schemas"
import type { CapitalSlug } from "@/lib/capitals"

/*
 * The ranking of the capitals, as the panel shows it: one row per capital,
 * in the release's order (by the exact share of residents meeting all three
 * rules, highest first, which the data's schema checks), each with its bar
 * and one number. Shares are shown as whole percents, rounded the same way
 * everywhere.
 */

/** How many rules a share of residents meets, from none to all three */
export type RulesMet = 0 | 1 | 2 | 3

/**
 * A share (from 0 to 1) as a whole percent, from 0 to 100. Shares are
 * written with four decimals, so they are first taken as a whole number of
 * hundredths of a percent: a share written 0.285 is 28.5%, which rounds up to
 * 29%, whatever its binary value (0.28499…).
 */
export function wholePercent(share: number) {
  const hundredths = Math.round(share * 10_000)
  return Math.round(hundredths / 100)
}

/**
 * A share as "about N in 10" (from 0 to 10), for the ranking's sentence. It
 * follows the whole percent shown in the row, so a capital shown at 25%
 * reads "about 3 in 10".
 */
export function inTenths(share: number) {
  return Math.round(wholePercent(share) / 10)
}

export type BarSegment = { rules: RulesMet; share: number }

/**
 * The segments of a capital's bar: the shares meeting all 3, 2, 1 and no
 * rules, always in that order. A share of zero has no segment, so the bar
 * never shows a sliver for residents who are not there.
 */
export function barSegments(shares: Shares): Array<BarSegment> {
  return ([3, 2, 1, 0] as const)
    .map((rules) => ({ rules, share: shares.met[rules] }))
    .filter(({ share }) => share > 0)
}

/** Whether a rank is on the podium: the top three have a filled badge */
export function isPodium(rank: number) {
  return rank <= 3
}

/** How many rows "Other capitals" shows: the capital and two around it */
const OTHER_CAPITALS = 3

/**
 * The rows of "Other capitals", on a capital's page: the capital with the
 * capitals ranked just above and just below it, in the ranking's order. The
 * first and the last capital, with no neighbour on one side, take the two
 * closest on the other. A release with fewer capitals shows them all; one
 * without this capital shows none.
 */
export function otherCapitals<Row extends { slug: CapitalSlug }>(
  rows: ReadonlyArray<Row>,
  slug: CapitalSlug
): Array<Row> {
  const index = rows.findIndex((row) => row.slug === slug)
  if (index === -1) {
    return []
  }
  const first = Math.max(0, Math.min(index - 1, rows.length - OTHER_CAPITALS))
  return rows.slice(first, first + OTHER_CAPITALS)
}
