import { useEffect, useMemo, useState } from "react"
import { useLocale, useTranslations } from "use-intl"

import { SearchField } from "@/components/ui/search-field"
import type { Capital } from "@/data/schemas"
import { azList, searchAz } from "@/lib/az-list"
import type { CapitalSlug } from "@/lib/capitals"
import { AzRows, type AzRowProps } from "./az-rows"

/*
 * The A–Z list of Home: a search field ("Find a capital or a country") and
 * the capitals in alphabetical order, in the visitor's language. Typing
 * narrows the list at once, with no motion, to the capitals whose name,
 * local name or country has a word starting with what is typed, accents and
 * case aside. When nothing matches, the list says so, with the search.
 *
 * Screen readers hear how many capitals are found, politely, once the count
 * has settled for a moment, so a word typed letter by letter is read once.
 * Nothing is read when the list appears: the region speaks only after a
 * search.
 */

/** How long the count must stay the same before it is read, in milliseconds */
const ANNOUNCE_DELAY = 600

export function AzList({
  capitals,
  defaultSearch = "",
  highlighted,
  rowProps,
  "data-force-focus": forceFocus,
}: {
  capitals: Array<Capital>
  defaultSearch?: string
  highlighted?: CapitalSlug
  rowProps?: AzRowProps
  // The kit page shows the field's focus ring at rest
  "data-force-focus"?: true
}) {
  const t = useTranslations("home.az")
  const locale = useLocale()
  const list = useMemo(() => azList(capitals, locale), [capitals, locale])
  const [search, setSearch] = useState(defaultSearch)
  const found = useMemo(() => searchAz(list, search), [list, search])

  const announcement = found.length
    ? t("found", { count: found.length })
    : t("noMatch", { search: search.trim() })
  // Read only once the visitor has searched
  const [searched, setSearched] = useState(false)
  const [announced, setAnnounced] = useState("")
  useEffect(() => {
    if (!searched) {
      return
    }
    const timer = setTimeout(() => setAnnounced(announcement), ANNOUNCE_DELAY)
    return () => clearTimeout(timer)
  }, [searched, announcement])

  return (
    <div className="flex flex-col gap-3">
      <SearchField
        label={t("search")}
        clearLabel={t("clear")}
        value={search}
        onValueChange={(value) => {
          setSearch(value)
          setSearched(true)
        }}
        data-force-focus={forceFocus}
      />
      {found.length > 0 ? (
        <AzRows entries={found} highlighted={highlighted} rowProps={rowProps} />
      ) : (
        <p className="px-1 text-small text-ink-2">{announcement}</p>
      )}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {announced}
      </p>
    </div>
  )
}
