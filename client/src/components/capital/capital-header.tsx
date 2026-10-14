import type { ReactNode } from "react"
import { useLocale, useTranslations } from "use-intl"

import { ChevronLeftIcon } from "@/components/icons"
import { TouchLink } from "@/components/motion/touch-link"
import { keyTags } from "@/components/ranking/ranking"
import { buttonVariants } from "@/components/ui/button"
import { ResultsBar } from "@/components/ui/results-bar"
import type { Summary } from "@/data/schemas"
import { nameIn } from "@/i18n/names"
import { wholePercent } from "@/lib/ranking"
import { residentsFigure } from "@/lib/residents"

/*
 * The header of a capital's page: "All capitals" (back to the ranking on
 * Home), the capital's name (the page's main heading), its country and
 * residents, then the share of its residents meeting all three rules, its
 * bar and the key of the bar, with each share (all four, a share of zero
 * too, though the bar has no segment for it). With the card, it is the text equivalent of
 * the map: screen readers hear the shares as one sentence, as in the
 * ranking's rows, rather than the share, the bar and the key one by one.
 */

const shareTags = {
  b: (chunks: ReactNode) => <b className="font-semibold">{chunks}</b>,
}

/** The header of the capital whose summary is given */
export function CapitalHeader({ summary }: { summary: Summary }) {
  const t = useTranslations("capital")
  const locale = useLocale()
  const [none, one, two, three] = summary.shares.met.map(
    (share) => wholePercent(share) / 100
  )
  const shares = { three, two, one, none }

  return (
    <div className="flex flex-col gap-3.5">
      {/*
       * Back to Home, on the ranking: the address leaves the tab out. Home
       * is not this page, though its address starts this page's.
       */}
      <TouchLink
        to="/$locale"
        params={{ locale }}
        activeOptions={{ exact: true }}
        className={buttonVariants({
          variant: "quiet",
          className: "-ml-1.5 self-start",
        })}
      >
        <ChevronLeftIcon data-icon="inline-start" />
        {t("allCapitals")}
      </TouchLink>
      <div className="flex flex-col gap-0.5">
        <h1 className="font-serif text-title">
          {nameIn(summary.name, locale)}
        </h1>
        <p className="text-small text-ink-2">
          {t("residents", {
            country: nameIn(summary.country.name, locale),
            ...residentsFigure(summary.residents),
          })}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <p aria-hidden="true" className="font-serif text-heading">
          {t.rich("share", { ...shares, ...shareTags })}
        </p>
        <ResultsBar shares={summary.shares} className="h-3 gap-0.75" />
        <p
          aria-hidden="true"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-2"
        >
          {t.rich("key", {
            three: 3,
            two: 2,
            one: 1,
            threeShare: three,
            twoShare: two,
            oneShare: one,
            noneShare: none,
            ...keyTags,
          })}
        </p>
        {/* What the share, the bar and the key show, in one sentence */}
        <p className="sr-only">{t("shares", shares)}</p>
      </div>
    </div>
  )
}
