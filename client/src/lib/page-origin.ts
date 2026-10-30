import { z } from "zod"

import { capitalSearchSchema } from "@/lib/capital-search"
import { capitalSlugs, isCapitalSlug } from "@/lib/capitals"
import { homeSearchSchema } from "@/lib/home-search"

/*
 * The page About or Methodology was opened from, so its back link returns
 * there: Home (with its tab), a capital (with its building, rule, facade and
 * view of the map), About or Methodology. The top bar's links write it into
 * the history entry of the page they open, so it survives going back and
 * forward and reloading the page. It is kept without the language, so the
 * back link leads to the same page in the language shown.
 *
 * A page opened directly, or from a history entry without a valid origin,
 * goes back to Home. So does a page its back link opens without going back
 * through the history: that link writes no origin, so two pages never lead
 * back to each other.
 */

const index = z.int().nonnegative().optional()

export const pageOriginSchema = z.discriminatedUnion("page", [
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
  z.object({ page: z.literal("about"), index }),
])

export type PageOrigin = z.infer<typeof pageOriginSchema>

/** The pages with a back link to the page they were opened from */
export type PageWithBackLink = "about" | "methodology"

/** Where a back link goes when its page was not opened from another one */
export const homeOrigin = {
  page: "home",
  search: homeSearchSchema.parse({}),
} satisfies PageOrigin

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
 * parameters and its history entry, as an origin; undefined for an address
 * that is no page.
 */
export function pageOriginOf({
  pathname,
  search,
  index: entry,
}: {
  pathname: string
  search: unknown
  index?: number
}): PageOrigin | undefined {
  const [, , ...rest] = pathname.replace(/\/+$/, "").split("/")
  const [section, slug, ...more] = rest

  if (section === undefined) {
    return {
      page: "home",
      search: homeSearchSchema.catch(homeOrigin.search).parse(search ?? {}),
      index: entry,
    }
  }
  if (
    (section === "methodology" || section === "about") &&
    slug === undefined
  ) {
    return { page: section, index: entry }
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
 * The origin to write into the history entry of `page`, opened from the
 * page shown (`here`, whose own entry holds `kept`, when it is About or
 * Methodology): the page shown, or, when that is `page` itself (opened
 * again from itself), the one it was opened from. A page is never its own
 * origin.
 */
export function openedFrom(
  page: PageWithBackLink,
  here: PageOrigin | undefined,
  kept: PageOrigin | undefined
) {
  const origin = here && here.page !== page ? here : kept
  return origin?.page === page ? undefined : origin
}

/**
 * The page the back link of `page` leads to, from what its history entry
 * holds: the origin written there, or Home when there is none, it is not
 * valid or it is the page itself
 */
export function backTarget(state: unknown, page: PageWithBackLink): PageOrigin {
  const result = pageOriginSchema.safeParse(state)
  return result.success && result.data.page !== page ? result.data : homeOrigin
}

/**
 * Whether going back in the history returns to the origin: the page's entry
 * comes right after the one it was opened from. The back link then acts as
 * the browser's back button, so the history does not grow and the page
 * comes back where the visitor left it.
 */
export function returnsByHistory(
  origin: PageOrigin,
  entry: number | undefined
) {
  return origin.index !== undefined && entry === origin.index + 1
}
