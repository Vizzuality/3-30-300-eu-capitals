import { useId, useLayoutEffect, useRef, type ReactNode } from "react"
import { useTranslations } from "use-intl"

import { SelectedBuildingBlock } from "@/components/capital/selected-building"
import { Swap } from "@/components/motion/swap"
import {
  RuleCard,
  RuleCardFigure,
  RuleCardLabel,
  RuleCardShare,
  RuleCards,
} from "@/components/ui/rule-card"
import type { Shares } from "@/data/schemas"
import type { CapitalView } from "@/lib/capital-view"
import { wholePercent } from "@/lib/ranking"
import type { Rule } from "@/lib/rules"
import { ruleThresholds } from "@/lib/rules"

/*
 * The middle of a capital's page, between the guide and Other capitals,
 * which follows the map's view: on the city overview, what the map shows and
 * the share of residents meeting each rule; at street level, one sentence;
 * with a building selected, its residents, a close button, the rule switcher
 * and the card of the rule shown.
 *
 * When the view changes, the block swaps in place (see `Swap`). If the
 * focus was in the block's old content (closing the building with its
 * button, or Escape on the switcher), it moves to the block itself, so the
 * keyboard carries on from there rather than from the start of the page.
 */

/** The side of a square of the city overview's grid, in metres */
const GRID_CELL = 10

export function MiddleBlock({
  view,
  shares,
  language,
  onRuleChange,
  onClose,
}: {
  view: CapitalView
  // The capital's share of residents meeting each rule
  shares: Shares["rules"]
  // The capital's language, for the local names quoted (a park's)
  language: string
  onRuleChange: (rule: Rule) => void
  onClose: () => void
}) {
  const block = useRef<HTMLDivElement>(null)
  const blockKey =
    view.view === "building" ? `building:${view.building.id}` : view.view

  // Focus in the block once its content has changed can only be in the old
  // content, still in the page (inert) while it fades out
  const shownKey = useRef(blockKey)
  useLayoutEffect(() => {
    if (shownKey.current === blockKey) {
      return
    }
    shownKey.current = blockKey
    const element = block.current
    const focused = document.activeElement
    if (element && focused !== element && element.contains(focused)) {
      element.focus()
    }
  }, [blockKey])

  return (
    <div ref={block} tabIndex={-1} className="outline-none">
      <Swap swapKey={blockKey}>
        {view.view === "building" ? (
          <SelectedBuildingBlock
            building={view.building}
            rule={view.rule}
            facade={view.facade}
            language={language}
            onRuleChange={onRuleChange}
            onClose={onClose}
          />
        ) : view.view === "street" ? (
          <StreetBlock />
        ) : (
          <OverviewBlock shares={shares} />
        )}
      </Swap>
    </div>
  )
}

// Each card is one whole message: its figure, its label and its share
const cardTags = {
  figure: (chunks: ReactNode) => <RuleCardFigure>{chunks}</RuleCardFigure>,
  label: (chunks: ReactNode) => <RuleCardLabel>{chunks}</RuleCardLabel>,
  result: (chunks: ReactNode) => <RuleCardShare>{chunks}</RuleCardShare>,
}

/** The city overview: what the map shows, and each rule's share */
function OverviewBlock({ shares }: { shares: Shares["rules"] }) {
  const t = useTranslations("capital.overview")
  const labelId = useId()
  const cards = [
    ["trees", { trees: ruleThresholds.trees, share: shares[3] }],
    ["canopy", { canopy: ruleThresholds.canopy, share: shares[30] }],
    ["park", { distance: ruleThresholds.parkDistance, share: shares[300] }],
  ] as const

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body">{t("sentence", { cell: GRID_CELL })}</p>
      <h2 id={labelId} className="mt-1.5 text-label text-ink-2 uppercase">
        {t("label")}
      </h2>
      <RuleCards aria-labelledby={labelId}>
        {cards.map(([rule, { share, ...figures }]) => (
          <RuleCard key={rule}>
            {t.rich(`rules.${rule}`, {
              ...figures,
              share: wholePercent(share) / 100,
              ...cardTags,
            })}
          </RuleCard>
        ))}
      </RuleCards>
    </div>
  )
}

/** The street: what the buildings' colours mean */
function StreetBlock() {
  const t = useTranslations("capital.street")

  return <p className="text-body">{t("sentence")}</p>
}
