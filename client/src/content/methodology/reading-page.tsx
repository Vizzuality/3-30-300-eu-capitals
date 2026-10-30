import type { ReactNode } from "react"
import { useTranslations } from "use-intl"

import { externalLinkTag } from "@/components/ui/external-link"
import { textLinkVariants } from "@/components/ui/text-link"
import type { Capitals, Sources } from "@/data/schemas"
import { papers } from "@/lib/site-links"
import { Detail, Section, Steps, richTags } from "./blocks"
import { DataTable, ExtractNote, useQuotedDates } from "./data-table"
import { CanopyDiagram, ParkDiagram, TreesDiagram } from "./diagrams"
import { useImagerySeason } from "./imagery-season"
import { methodologySections } from "./sections"

/*
 * The text of the Methodology page, section by section. Each starts with
 * the idea in plain words, with a few steps and a diagram for each rule,
 * then an "In detail" box with the data, the thresholds and how the data is
 * transformed. One message per paragraph, in `methodology`. The dates the
 * text quotes are the release's, as in the data table, and so are the
 * months of the imagery of the capitals it names.
 */

type QuotedDates = ReturnType<typeof useQuotedDates>

const [trees, canopy, park, residents, cityLimits, data, limits] =
  methodologySections

const inlineLink = textLinkVariants({ variant: "inline" })

function Paragraph({ children }: { children: ReactNode }) {
  return <p className="text-body">{children}</p>
}

function TreesSection({ dates }: { dates: QuotedDates }) {
  const t = useTranslations("methodology")

  return (
    <Section section={trees} first>
      <Paragraph>{t("trees.intro")}</Paragraph>
      <Steps
        items={["find", "facades", "look", "decide"] as const}
        render={(step) => t.rich(`trees.steps.${step}`, richTags)}
      />
      <TreesDiagram />
      <Detail
        title={t("inDetail")}
        items={
          [
            "trees",
            "peaks",
            "buildings",
            "facades",
            "lookingOut",
            "residents",
            "grid",
          ] as const
        }
        render={(item) =>
          t.rich(`trees.detail.${item}`, {
            ...richTags,
            imagery: dates.imagery,
          })
        }
      />
    </Section>
  )
}

function CanopySection() {
  const t = useTranslations("methodology")

  return (
    <Section section={canopy} first={false}>
      <Paragraph>{t("canopy.intro")}</Paragraph>
      <Steps
        items={["canopy", "circle", "measure"] as const}
        render={(step) => t.rich(`canopy.steps.${step}`, richTags)}
      />
      <CanopyDiagram />
      <Detail
        title={t("inDetail")}
        items={["canopy", "squares", "water", "building"] as const}
        render={(item) => t.rich(`canopy.detail.${item}`, richTags)}
      />
    </Section>
  )
}

function ParkSection() {
  const t = useTranslations("methodology")

  return (
    <Section section={park} first={false}>
      <Paragraph>{t("park.intro")}</Paragraph>
      <Steps
        items={["find", "walk", "decide"] as const}
        render={(step) => t.rich(`park.steps.${step}`, richTags)}
      />
      <ParkDiagram />
      <Detail
        title={t("inDetail")}
        items={
          ["greenSpaces", "size", "whyMapped", "network", "distance"] as const
        }
        render={(item) =>
          t.rich(`park.detail.${item}`, {
            ...richTags,
            rule: externalLinkTag(papers.konijnendijk, inlineLink),
            study: externalLinkTag(papers.bertassello, inlineLink),
          })
        }
      />
    </Section>
  )
}

function ResidentsSection({ dates }: { dates: QuotedDates }) {
  const t = useTranslations("methodology")

  return (
    <Section section={residents} first={false}>
      <Paragraph>{t("residents.intro")}</Paragraph>
      <Detail
        title={t("inDetail")}
        items={["population", "placing", "shares"] as const}
        render={(item) =>
          t.rich(`residents.detail.${item}`, {
            ...richTags,
            population: dates.population,
          })
        }
      />
    </Section>
  )
}

function CityLimitsSection({ dates }: { dates: QuotedDates }) {
  const t = useTranslations("methodology")

  return (
    <Section section={cityLimits} first={false}>
      <Paragraph>{t("cityLimits.intro")}</Paragraph>
      <Detail
        title={t("inDetail")}
        items={["boundaries", "sea", "margin", "grid", "buildings"] as const}
        render={(item) =>
          t.rich(`cityLimits.detail.${item}`, { ...richTags, osm: dates.osm })
        }
      />
    </Section>
  )
}

function DataSection({ sources }: { sources: Sources }) {
  const t = useTranslations("methodology")

  return (
    <Section section={data} first={false}>
      <Paragraph>{t("data.intro")}</Paragraph>
      <DataTable sources={sources} />
      <ExtractNote sources={sources} />
    </Section>
  )
}

function LimitsSection({
  dates,
  sources,
  capitals,
}: {
  dates: QuotedDates
  sources: Sources
  capitals: Capitals
}) {
  const t = useTranslations("methodology")
  const season = useImagerySeason(sources, capitals)
  const values = {
    ...richTags,
    ...dates,
    groups: season.groups,
    whole: season.whole,
    part: season.part,
    link: externalLinkTag(papers.bertassello, inlineLink),
  }

  return (
    <Section section={limits} first={false}>
      <Paragraph>{t("limits.intro")}</Paragraph>
      <Detail
        title={t("limits.data.title")}
        items={(
          [
            "dates",
            "fromAbove",
            "model",
            "season",
            "population",
            "homes",
            "mapped",
          ] as const
        ).filter((item) => item !== "season" || season.named)}
        render={(item) => t.rich(`limits.data.items.${item}`, values)}
      />
      <Detail
        title={t("limits.method.title")}
        items={
          [
            "streetLevel",
            "oneResult",
            "walks",
            "edges",
            "cityLimits",
            "homeMap",
            "rounding",
            "assessment",
          ] as const
        }
        render={(item) => t.rich(`limits.method.items.${item}`, values)}
      />
    </Section>
  )
}

/**
 * The reading page: on desktop it covers the map area and scrolls on its
 * own, so it is a focus stop for scrolling with the keyboard; on phones it
 * follows the panel's content, full width
 */
export function ReadingPage({
  sources,
  capitals,
}: {
  sources: Sources
  capitals: Capitals
}) {
  const dates = useQuotedDates(sources)

  return (
    <article
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      data-scroll-restoration-id="reading"
      className="-mx-panel-inset-phone -mb-7 bg-background px-panel-inset-phone pt-10 pb-16 desktop:absolute desktop:inset-y-0 desktop:right-0 desktop:left-panel desktop:mx-0 desktop:mb-0 desktop:overflow-y-auto desktop:px-0 desktop:pt-0 desktop:pb-0"
    >
      <div className="mx-auto flex max-w-170 flex-col desktop:px-10 desktop:pt-14 desktop:pb-24">
        <TreesSection dates={dates} />
        <CanopySection />
        <ParkSection />
        <ResidentsSection dates={dates} />
        <CityLimitsSection dates={dates} />
        <DataSection sources={sources} />
        <LimitsSection dates={dates} sources={sources} capitals={capitals} />
      </div>
    </article>
  )
}
