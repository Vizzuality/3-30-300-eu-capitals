import type { ReactNode } from "react"
import { useTranslations } from "use-intl"

import { CloseIcon } from "@/components/icons"
import { Swap } from "@/components/motion/swap"
import {
  Chip,
  ChipFigure,
  ChipGroup,
  ChipStatus,
  ChipUnit,
  StatusMark,
} from "@/components/ui/chip"
import { IconButton } from "@/components/ui/icon-button"
import type { FacadeResult, SelectedBuilding } from "@/lib/building"
import {
  canopyRadius,
  parkArea,
  rules,
  ruleThresholds,
  type Rule,
} from "@/lib/rules"

/*
 * A selected building in the panel: its residents and a close button, the
 * 3 · 30 · 300 switcher, then the short card of the rule shown, or of the
 * facade selected (with the 3 trees rule).
 *
 * The switcher is a radio group (see `ChipGroup`): one Tab stop, the arrow
 * keys choose the next rule, and each chip says whether the building meets
 * its rule (a tick, or a dash). The chosen chip is edged in Ink. When the
 * rule or the facade changes, the card swaps in place (see `Swap`).
 */

/** How far a path is looked for around a building, in metres */
const PATH_REACH = 100

/** Whether a rule is met, as the messages' select takes it */
const status = (met: boolean) => (met ? "yes" : "no")

export function SelectedBuildingBlock({
  building,
  rule,
  facade,
  language,
  onRuleChange,
  onClose,
}: {
  building: SelectedBuilding
  rule: Rule
  facade?: FacadeResult
  // The capital's language, for the name of a park
  language: string
  onRuleChange: (rule: Rule) => void
  onClose: () => void
}) {
  const t = useTranslations("capital")

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-label text-ink-2 uppercase">
          {t("building.label", building.residents)}
        </h2>
        <IconButton label={t("closeBuilding")} onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </div>
      <RuleSwitcher
        building={building}
        rule={rule}
        onRuleChange={onRuleChange}
      />
      <Swap swapKey={facade ? `facade:${facade.id}` : `rule:${rule}`}>
        {facade ? (
          <FacadeCard facade={facade} />
        ) : (
          <RuleResultCard building={building} rule={rule} language={language} />
        )}
      </Swap>
    </div>
  )
}

const chipTags = {
  figure: (chunks: ReactNode) => <ChipFigure>{chunks}</ChipFigure>,
  unit: (chunks: ReactNode) => <ChipUnit>{chunks}</ChipUnit>,
}

/** The 3 · 30 · 300 switcher: one chip per rule, met or not met */
export function RuleSwitcher({
  building,
  rule,
  onRuleChange,
}: {
  building: SelectedBuilding
  rule: Rule
  onRuleChange: (rule: Rule) => void
}) {
  const t = useTranslations("capital.building")

  return (
    <ChipGroup
      aria-label={t("rules")}
      value={rule}
      onValueChange={(value) => onRuleChange(value as Rule)}
    >
      {rules.map((chip) => (
        <Chip key={chip} value={chip}>
          {t.rich(`chips.${chip}`, { rule: chip, ...chipTags })}
          <ChipStatus met={building.met[chip]}>
            {t("status", { met: status(building.met[chip]) })}
          </ChipStatus>
        </Chip>
      ))}
    </ChipGroup>
  )
}

/**
 * A short card: what it is about, the result in plain words, then met or
 * not met with what the rule needs, and sometimes a note
 */
function ResultCard({
  context,
  result,
  met,
  verdict,
  note,
}: {
  context: ReactNode
  result: ReactNode
  met: boolean
  verdict: ReactNode
  note?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-control bg-surface-2 px-4.5 py-4">
      <p className="text-small text-ink-2">{context}</p>
      <p className="font-serif text-heading">{result}</p>
      <p className="flex items-center gap-1.5 text-card-status text-ink-2">
        <StatusMark met={met} />
        <span>{verdict}</span>
      </p>
      {note && <p className="text-small text-ink-2">{note}</p>}
    </div>
  )
}

// The verdict in the card's status line stands out
const verdictTags = {
  b: (chunks: ReactNode) => <b className="font-semibold text-ink">{chunks}</b>,
}

/**
 * A local name (a park's) as written on the signs, in the capital's
 * language, so screen readers pronounce it in that language
 */
const localName = (language: string) =>
  function LocalName(chunks: ReactNode) {
    return <span lang={language}>{chunks}</span>
  }

/** The card of a rule, for the whole building */
export function RuleResultCard({
  building,
  rule,
  language,
}: {
  building: SelectedBuilding
  rule: Rule
  language: string
}) {
  const t = useTranslations("capital.cards")
  const met = building.met[rule]
  const verdict = { met: status(met), ...verdictTags }

  if (rule === 3) {
    const { percent, facades, passing } = building.trees
    return (
      <ResultCard
        context={t("trees.context", { facades })}
        result={t("trees.result", {
          share: percent / 100,
          trees: ruleThresholds.trees,
        })}
        met={met}
        verdict={t.rich("trees.status", verdict)}
        note={t("trees.note", {
          facades,
          passing,
          trees: ruleThresholds.trees,
        })}
      />
    )
  }

  if (rule === 30) {
    return (
      <ResultCard
        context={t("canopy.context", { radius: canopyRadius })}
        result={t("canopy.result", { canopy: building.canopy.percent / 100 })}
        met={met}
        verdict={t.rich("canopy.status", {
          ...verdict,
          needed: ruleThresholds.canopy,
        })}
      />
    )
  }

  const { kind, metres, park } = building.walk
  return (
    <ResultCard
      context={t("park.context", { area: parkArea })}
      result={t.rich("park.result", {
        kind,
        walk: metres,
        named: park === null ? "no" : "yes",
        park: park ?? "",
        reach: PATH_REACH,
        name: localName(language),
      })}
      met={met}
      verdict={t.rich("park.status", {
        ...verdict,
        distance: ruleThresholds.parkDistance,
      })}
    />
  )
}

/** The card of a facade: where it looks, its residents, the trees it sees */
export function FacadeCard({ facade }: { facade: FacadeResult }) {
  const t = useTranslations("capital.cards.facade")

  return (
    <ResultCard
      context={t("context", {
        orientation: facade.orientation,
        ...facade.residents,
      })}
      result={t("result", { trees: facade.trees })}
      met={facade.met}
      verdict={t.rich("status", {
        met: status(facade.met),
        needed: ruleThresholds.trees,
        ...verdictTags,
      })}
    />
  )
}
