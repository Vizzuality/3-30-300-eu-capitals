import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { useLocale, useTranslations } from "use-intl"

import { RankingList, type RowProps } from "@/components/ranking/ranking-list"
import { textLinkVariants } from "@/components/ui/text-link"
import type { Capital, Ranking } from "@/data/schemas"
import { capitalSlugs, type CapitalSlug } from "@/lib/capitals"
import { otherCapitals } from "@/lib/ranking"

/*
 * Other capitals, at the end of a capital's page: three short rows of the
 * ranking, the capital with the capitals ranked just above and just below it
 * (for the first and the last, the two closest), and "All 27", back to the
 * ranking on Home. The block is muted: only this capital's bar keeps its full
 * colours. The rows respond like the ranking's: the highlight rests on this
 * capital and follows the pointer and the keyboard (Follow), and a pressed
 * row squashes, sends out a ring and opens its capital.
 */

const allTags = {
  hidden: (chunks: ReactNode) => <span className="sr-only">{chunks}</span>,
}

/**
 * Other capitals on the page of `slug`, from the release's ranking and the
 * capitals' outlines; `highlighted` and `rowProps` hold a state still (the
 * kit page)
 */
export function OtherCapitals({
  slug,
  ranking,
  capitals,
  highlighted,
  rowProps,
}: {
  slug: CapitalSlug
  ranking: Ranking
  capitals: Array<Capital>
  highlighted?: CapitalSlug
  rowProps?: RowProps
}) {
  const t = useTranslations("capital")
  const locale = useLocale()
  const rows = otherCapitals(ranking.capitals, slug)

  if (rows.length === 0) {
    return null
  }

  return (
    <div data-slot="other-capitals" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="text-label text-ink-2 uppercase">
          {t("otherCapitals")}
        </h2>
        {/* Back to Home, on the ranking: the address leaves the tab out */}
        <Link
          to="/$locale"
          params={{ locale }}
          activeOptions={{ exact: true }}
          className={textLinkVariants({ variant: "strong" })}
        >
          {t.rich("allRanking", {
            capitals: capitalSlugs.length,
            ...allTags,
          })}
        </Link>
      </div>
      <RankingList
        rows={rows}
        capitals={capitals}
        current={slug}
        highlighted={highlighted}
        rowProps={rowProps}
      />
    </div>
  )
}
