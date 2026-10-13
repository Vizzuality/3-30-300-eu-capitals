import { z } from "zod"

import { rules } from "@/lib/rules"

/*
 * The capital page's state in its address, so a view can be shared and the
 * browser's back button works: the selected building, the rule shown and
 * the selected facade (`/en/capitals/stockholm?building=1204&rule=30`). The
 * router reads numbers in the address as numbers.
 *
 * A value that is not valid is dropped rather than failing the page, so a
 * mistyped or outdated link still opens the capital.
 */

/**
 * Buildings and facades are numbered 1, 2, 3… within each capital, and stay
 * below 2²⁴ so the map can match them exactly as 32-bit floats
 */
const featureId = z
  .int()
  .positive()
  .max(2 ** 24)

export const capitalSearchSchema = z.object({
  // The selected building (street level)
  building: featureId.optional().catch(undefined),
  // The rule shown for it; the 3 trees rule when there is none
  rule: z.literal(rules).optional().catch(undefined),
  // The selected facade of the building (rule 3 only)
  facade: featureId.optional().catch(undefined),
})

export type CapitalSearch = z.infer<typeof capitalSearchSchema>
