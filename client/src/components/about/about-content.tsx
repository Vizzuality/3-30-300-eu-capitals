import { useLocation, useRouter } from "@tanstack/react-router"
import type { MouseEvent, ReactNode } from "react"
import { useFormatter, useLocale, useTranslations } from "use-intl"

import { ChevronLeftIcon } from "@/components/icons"
import { TouchAnchor, TouchLink } from "@/components/motion/touch-link"
import { buttonVariants } from "@/components/ui/button"
import { ExternalLink, externalLinkTag } from "@/components/ui/external-link"
import { textLinkVariants } from "@/components/ui/text-link"
import type { Sources } from "@/data/schemas"
import { useHydrated } from "@/hooks/use-hydrated"
import {
  aboutBackTarget,
  historyEntry,
  homeOrigin,
  returnsByHistory,
  type AboutOrigin,
} from "@/lib/about-origin"
import { capitalSlugs } from "@/lib/capitals"
import { creditsOf, type Credit } from "@/lib/credits"
import { gridCell, ruleThresholds } from "@/lib/rules"
import { externalRel, papers, siteLinks } from "@/lib/site-links"

/*
 * The About page: what the site is, the two papers it builds on, the
 * credits of the data it uses and the links to who made it and to its code.
 * Who made the site is in the footer, and is not repeated here. The page
 * arrives in three parts (Float): the back link and the intro, Based on,
 * then the credits and the links.
 */

// The European study's cities, as it reports them
const assessedCities = 862

const backClassName = buttonVariants({
  variant: "quiet",
  className: "-ml-1.5 self-start",
})

/**
 * Back to the page About was opened from (see `aboutBackTarget`), in the
 * language shown; Home when About was opened directly. When that page is
 * the previous entry of the history, it goes back in the history, as the
 * browser's back button does. The server, which cannot know where About was
 * opened from, renders the link to Home; the browser updates it once it has
 * taken the page over. `origin` sets the target instead (the kit page shows
 * each one).
 */
export function AboutBackLink({ origin }: { origin?: AboutOrigin }) {
  const t = useTranslations("about")
  const locale = useLocale()
  const router = useRouter()
  const hydrated = useHydrated()
  const state = useLocation({ select: (location) => location.state })
  const target =
    origin ?? (hydrated ? aboutBackTarget(state.aboutFrom) : homeOrigin)

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const plain =
      event.button === 0 &&
      !(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
    if (plain && returnsByHistory(target, historyEntry(state))) {
      event.preventDefault()
      router.history.back()
    }
  }

  const label = (
    <>
      <ChevronLeftIcon data-icon="inline-start" />
      {t("back", { page: target.page })}
    </>
  )

  switch (target.page) {
    case "methodology":
      return (
        <TouchLink
          to="/$locale/methodology"
          params={{ locale }}
          onClick={onClick}
          className={backClassName}
        >
          {label}
        </TouchLink>
      )
    case "capital":
      return (
        <TouchLink
          to="/$locale/capitals/$slug"
          params={{ locale, slug: target.slug }}
          search={target.search}
          onClick={onClick}
          className={backClassName}
        >
          {label}
        </TouchLink>
      )
    default:
      return (
        <TouchLink
          to="/$locale"
          params={{ locale }}
          search={target.search}
          // Home is not this page, though its address starts this page's
          activeOptions={{ exact: true }}
          onClick={onClick}
          className={backClassName}
        >
          {label}
        </TouchLink>
      )
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="font-serif text-heading">{title}</h2>
      {children}
    </section>
  )
}

const journalTags = {
  journal: (chunks: ReactNode) => <i>{chunks}</i>,
}

/** The two papers, each one citation that links to the paper */
export function BasedOn() {
  const t = useTranslations("about.basedOn")

  return (
    <Section title={t("title")}>
      <p className="text-body">
        {t("text", { cities: assessedCities, cell: gridCell })}
      </p>
      <ul className="flex flex-col gap-2.5">
        {(["konijnendijk", "bertassello"] as const).map((paper) => (
          <li key={paper}>
            <ExternalLink
              href={papers[paper]}
              className="block rounded-control border border-line px-3.5 py-3 text-control text-ink transition-colors hover:bg-surface-2"
            >
              {t.rich(`papers.${paper}`, journalTags)}
            </ExternalLink>
          </li>
        ))}
      </ul>
    </Section>
  )
}

const inlineLink = textLinkVariants({ variant: "inline" })

/** One credit: its sources, named and linked, then its attribution and licence */
function CreditItem({ credit }: { credit: Credit }) {
  const t = useTranslations("about.credits")
  const format = useFormatter()

  return (
    <li className="relative flex flex-col gap-0.5 pl-3.5 before:absolute before:top-2 before:left-0 before:size-1.25 before:rounded-full before:bg-line">
      <span className="text-control text-ink">
        {format.list(
          credit.sources.map(({ name, url }) => (
            <ExternalLink key={url} href={url} className={inlineLink}>
              {name}
            </ExternalLink>
          )),
          { type: "conjunction" }
        )}
      </span>
      <span className="text-small text-ink-2">
        {t.rich("terms", {
          attribution: credit.attribution === undefined ? "none" : "shown",
          text: credit.attribution ?? "",
          licence: credit.licence.name,
          link: externalLinkTag(credit.licence.url, inlineLink),
        })}
      </span>
    </li>
  )
}

/**
 * The credits of every source of the release, with the attribution each
 * licence asks for
 */
export function DataCredits({ sources }: { sources: Sources }) {
  const t = useTranslations("about.credits")
  const credits = creditsOf(sources.sources)

  return (
    <Section title={t("title")}>
      <ul className="flex flex-col gap-2.5">
        {credits.map((credit) => (
          <CreditItem key={credit.sources[0].url} credit={credit} />
        ))}
      </ul>
    </Section>
  )
}

const linkClassName = buttonVariants({ variant: "secondary" })

/** Who made the site, and its code once the code is public */
export function AboutLinks() {
  const t = useTranslations("about.links")

  return (
    <Section title={t("title")}>
      <ul className="flex flex-wrap gap-2">
        <li>
          <TouchAnchor
            href={siteLinks.vizzuality}
            rel={externalRel}
            className={linkClassName}
          >
            {t("vizzuality")}
          </TouchAnchor>
        </li>
        {siteLinks.code && (
          <li>
            <TouchAnchor
              href={siteLinks.code}
              rel={externalRel}
              className={linkClassName}
            >
              {t("code")}
            </TouchAnchor>
          </li>
        )}
      </ul>
    </Section>
  )
}

const introFigures = {
  capitals: capitalSlugs.length,
  canopy: ruleThresholds.canopy,
  distance: ruleThresholds.parkDistance,
}

/** The page's content, in its three parts */
export function AboutContent({ sources }: { sources: Sources }) {
  const t = useTranslations("about")

  return (
    <>
      <div className="flex flex-col gap-3.5">
        <AboutBackLink />
        <div className="flex flex-col gap-2.5">
          <h1 className="font-serif text-title">{t("title")}</h1>
          <p className="text-body">{t("intro", introFigures)}</p>
        </div>
      </div>
      <BasedOn />
      <div className="flex flex-col gap-block">
        <DataCredits sources={sources} />
        <AboutLinks />
      </div>
    </>
  )
}
