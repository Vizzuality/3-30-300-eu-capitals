import { z } from "zod"

import { capitalSearchSchema } from "@/lib/capital-search"
import { capitalSlugs, isCapitalSlug } from "@/lib/capitals"
import { homeSearchSchema } from "@/lib/home-search"

/*
 * The page About was opened from, so its back link returns there: Home (with
 * its tab), a capital (with its building, rule, facade and view of the map)
 * or Methodology. The top bar's About link writes it into the history entry
 * of the About page, so it survives going back and forward and reloading the
 * page. It is kept without the language, so the back link leads to the same
 * page in the language shown.
 *
 * About opened directly, or from a history entry without a valid origin,
 * goes back to Home.
 */

const index = z.int().nonnegative().optional()

export const aboutOriginSchema = z.discriminatedUnion("page", [
  z.object({
    page: z.literal("home"),
    search: homeSearchSchema.catch(homeSearchSchema.parse({})),
    // The history entry it was opened from, when it is known
    index,
  }),
  z.object({
    page: z.literal("capital"),
    slug: z.enum(capitalSlugs),
    search: capitalSearchSchema.catch(capitalSearchSchema.parse({})),
    index,
  }),
  z.object({ page: z.literal("methodology"), index }),
])

export type AboutOrigin = z.infer<typeof aboutOriginSchema>

/** Where the back link goes when About was not opened from another page */
export const homeOrigin = {
  page: "home",
  search: homeSearchSchema.parse({}),
} satisfies AboutOrigin

/*
 * The router numbers the entries of the history it adds, in their state, so
 * a page knows where it stands in the history
 */
const entryKey = "__TSR_index"

/** The number of a history entry, from its state */
export function historyEntry(state: { [entryKey]?: number }) {
  return state[entryKey]
}

/**
 * The page shown at `pathname` (`/en/capitals/stockholm`), with its search
 * parameters and its history entry, as an origin for About; undefined for
 * About itself and for an address that is no page.
 */
export function aboutOriginOf({
  pathname,
  search,
  index: entry,
}: {
  pathname: string
  search: unknown
  index?: number
}): AboutOrigin | undefined {
  const [, , ...rest] = pathname.replace(/\/+$/, "").split("/")
  const [section, slug, ...more] = rest

  if (section === undefined) {
    return {
      page: "home",
      search: homeSearchSchema.catch(homeOrigin.search).parse(search ?? {}),
      index: entry,
    }
  }
  if (section === "methodology" && slug === undefined) {
    return { page: "methodology", index: entry }
  }
  if (
    section === "capitals" &&
    slug !== undefined &&
    isCapitalSlug(slug) &&
    more.length === 0
  ) {
    return {
      page: "capital",
      slug,
      search: capitalSearchSchema
        .catch(capitalSearchSchema.parse({}))
        .parse(search ?? {}),
      index: entry,
    }
  }
  return undefined
}

/**
 * The page the back link of About leads to, from what its history entry
 * holds: the origin written there, or Home when there is none or it is not
 * valid
 */
export function aboutBackTarget(state: unknown): AboutOrigin {
  const result = aboutOriginSchema.safeParse(state)
  return result.success ? result.data : homeOrigin
}

/**
 * Whether going back in the history returns to the origin: About's entry
 * comes right after the one it was opened from. The back link then acts as
 * the browser's back button, so the history does not grow and the page
 * comes back where the visitor left it.
 */
export function returnsByHistory(
  origin: AboutOrigin,
  entry: number | undefined
) {
  return origin.index !== undefined && entry === origin.index + 1
}
