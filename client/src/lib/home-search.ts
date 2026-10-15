import { z } from "zod"

import { visibleAreaParam } from "@/lib/visible-area"

/*
 * Home's state in its address: the tab open under the guide, so a shared
 * link opens it and the browser's back button returns to the other one
 * (`/en?tab=az`), and the area of Europe in view, as the map writes it
 * (`at`, as on a capital's page). The ranking is open by default and is left
 * out of the address. The capital page's own parameters (`building`,
 * `rule`, `facade`) are not Home's, and Home's tab is not the capital
 * page's: each page drops the other's.
 *
 * A value that is not valid is dropped, so the page opens on the ranking.
 */

/** Home's tabs: the ranking of the capitals, and the A–Z list */
export const homeTabs = ["ranking", "az"] as const

export type HomeTab = (typeof homeTabs)[number]

export const defaultHomeTab: HomeTab = "ranking"

export const homeSearchSchema = z.object({
  tab: z.enum(homeTabs).default(defaultHomeTab).catch(defaultHomeTab),
  // The area of the map in view: west, south, east, north
  at: visibleAreaParam.optional().catch(undefined),
})

/** The parameters left out of the address while they have these values */
export const homeSearchDefaults = { tab: defaultHomeTab }

export type HomeSearch = z.infer<typeof homeSearchSchema>
