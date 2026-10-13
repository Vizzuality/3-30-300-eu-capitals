import type { ReactNode } from "react"
import { useLocale, useTranslations } from "use-intl"

import { resultColors } from "@/components/ui/results-bar"
import type { Capital, Ranking as RankingData } from "@/data/schemas"
import { nameIn } from "@/i18n/names"
import { inTenths, type RulesMet } from "@/lib/ranking"
import type { CapitalSlug } from "@/lib/capitals"
import { cn } from "@/lib/utils"
import { RankingList, type RowProps } from "./ranking-list"

/*
 * The ranking of the capitals, meant to be friendly rather than a table of
 * statistics: a sentence instead of a header (who leads, and what that means
 * in people), the key in words, once, then one row per capital.
 */

function KeyItem({
  rules,
  children,
}: {
  rules: RulesMet
  children: ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.25">
      <span
        aria-hidden="true"
        className={cn("size-2.5 rounded-key", resultColors[rules])}
      />
      {children}
    </span>
  )
}

// Each colour of the bars is marked in the key's one message, so a language
// can word (and order) it as it needs
const keyTags = {
  met3: (chunks: ReactNode) => <KeyItem rules={3}>{chunks}</KeyItem>,
  met2: (chunks: ReactNode) => <KeyItem rules={2}>{chunks}</KeyItem>,
  met1: (chunks: ReactNode) => <KeyItem rules={1}>{chunks}</KeyItem>,
  met0: (chunks: ReactNode) => <KeyItem rules={0}>{chunks}</KeyItem>,
}

/** What the colours of the bars mean, in words: all 3 rules, 2, 1 or none */
function RankingKey() {
  const t = useTranslations("ranking")

  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-2">
      {t.rich("key", { three: 3, two: 2, one: 1, ...keyTags })}
    </p>
  )
}

/**
 * The whole ranking: the sentence on the capital that leads, the key and the
 * rows, from the release's ranking and the capitals' outlines. `highlighted`
 * is the capital highlighted from elsewhere (the map); `rowProps` are passed
 * on to the rows (the kit page holds a state still with them).
 */
export function Ranking({
  ranking,
  capitals,
  highlighted,
  rowProps,
}: {
  ranking: RankingData
  capitals: Array<Capital>
  highlighted?: CapitalSlug
  rowProps?: RowProps
}) {
  const t = useTranslations("ranking")
  const locale = useLocale()
  // In the release's order: the first leads
  const rows = ranking.capitals
  const leader = rows.at(0)

  return (
    <div className="flex flex-col gap-3.5">
      {leader && (
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-heading">
            {t("leader", { capital: nameIn(leader.name, locale) })}
          </h2>
          <p className="text-body text-ink-2">
            {t("leaderShare", { tenths: inTenths(leader.shares.met[3]) })}
          </p>
        </div>
      )}
      <RankingKey />
      <RankingList
        rows={rows}
        capitals={capitals}
        highlighted={highlighted}
        rowProps={rowProps}
      />
    </div>
  )
}
