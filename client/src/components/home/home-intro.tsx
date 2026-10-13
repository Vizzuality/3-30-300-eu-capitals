import type { ReactNode } from "react"
import { useTranslations } from "use-intl"

import {
  RuleCard,
  RuleCardFigure,
  RuleCardLabel,
  RuleCards,
} from "@/components/ui/rule-card"
import { capitalSlugs } from "@/lib/capitals"
import { ruleThresholds } from "@/lib/rules"

// The figures of the rule, in the messages' arguments
const figures = {
  capitals: capitalSlugs.length,
  trees: ruleThresholds.trees,
  canopy: ruleThresholds.canopy,
  distance: ruleThresholds.parkDistance,
}

// Each card is one whole message, its figure and its label marked in it, so
// a language can word (and order) them as it needs
const cardTags = {
  figure: (chunks: ReactNode) => <RuleCardFigure>{chunks}</RuleCardFigure>,
  label: (chunks: ReactNode) => <RuleCardLabel>{chunks}</RuleCardLabel>,
}

/** The three rules as cards: 3 trees in view, 30% canopy, 300 m to a park */
export function IntroRuleCards() {
  const t = useTranslations("home.intro.rules")

  return (
    <RuleCards>
      {(["trees", "canopy", "park"] as const).map((rule) => (
        <RuleCard key={rule}>
          {t.rich(rule, { ...figures, ...cardTags })}
        </RuleCard>
      ))}
    </RuleCards>
  )
}

/**
 * The intro of Home: what the site is about (the page's title) and what the
 * 3-30-300 rule asks for, in two plain lines and three cards. It arrives as
 * one part of the panel's content, before the guide and the tabs.
 */
export function HomeIntro() {
  const t = useTranslations("home.intro")

  return (
    <div className="flex flex-col gap-block">
      <div className="flex flex-col gap-2.5">
        <p className="text-label text-ink-2 uppercase">{t("label", figures)}</p>
        <h1 className="font-serif text-display-phone desktop:text-display">
          {t("title")}
        </h1>
        <p className="text-body text-ink-2">{t("lead", figures)}</p>
      </div>
      <IntroRuleCards />
    </div>
  )
}
