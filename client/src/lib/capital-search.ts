import { z } from "zod"

import { defaultRule, rules } from "@/lib/rules"
import { visibleAreaParam } from "@/lib/visible-area"

/*
 * The capital page's state in its address, so a view can be shared and the
 * browser's back button works: the selected building, the rule shown, the
 * selected facade and the area of the map in view
 * (`/en/capitals/stockholm?building=1204&rule=30`). The router reads numbers
 * in the address as numbers.
 *
 * A value that is not valid is dropped rather than failing the page, so a
 * mistyped or outdated link still opens the capital. The 3 trees rule is
 * shown when there is no other, and is left out of the address. A rule and
 * a facade only belong with a building, and a facade with the 3 trees rule
 * alone, so a rule without a building, or a facade with another rule, is
 * dropped too.
 */

/**
 * Buildings and facades are numbered 1, 2, 3… within each capital, and stay
 * below 2²⁴ so the map can match them exactly as 32-bit floats
 */
const featureId = z
  .int()
  .positive()
  .max(2 ** 24)

export const capitalSearchSchema = z
  .object({
    // The selected building (street level)
    building: featureId.optional().catch(undefined),
    // The rule shown for it
    rule: z.literal(rules).default(defaultRule).catch(defaultRule),
    // The selected facade of the building (rule 3 only)
    facade: featureId.optional().catch(undefined),
    // The area of the map in view: west, south, east, north
    at: visibleAreaParam.optional().catch(undefined),
  })
  .transform(({ building, rule, facade, at }) =>
    building === undefined
      ? { rule: defaultRule, at }
      : {
          building,
          rule,
          facade: rule === 3 ? facade : undefined,
          at,
        }
  )

/** The parameters left out of the address while they have these values */
export const capitalSearchDefaults = { rule: defaultRule }

export type CapitalSearch = z.infer<typeof capitalSearchSchema>
