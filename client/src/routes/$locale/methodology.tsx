import { createFileRoute } from "@tanstack/react-router"
import { useTranslations } from "use-intl"

import { NotFoundPage } from "@/components/layout/not-found-page"
import { pageHead } from "@/i18n/head"
import { assertLocale } from "./-guards"

const sections = [
  "trees",
  "canopy",
  "park",
  "residents",
  "cityLimits",
  "data",
  "limits",
] as const

export const Route = createFileRoute("/$locale/methodology")({
  beforeLoad: ({ params }) => assertLocale(params.locale),
  head: (context) =>
    pageHead(context, (t) => ({
      title: t("methodology.meta.title"),
      description: t("methodology.meta.description"),
    })),
  // The reading page takes the map's place; the map stays mounted, hidden
  staticData: { mapArea: "hidden" },
  notFoundComponent: NotFoundPage,
  component: Methodology,
})

function Methodology() {
  const t = useTranslations("methodology")

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <p className="text-label text-ink-2 uppercase">{t("label")}</p>
        <h1 className="font-serif text-title">{t("title")}</h1>
      </div>
      {/*
       * The reading page: on desktop it covers the map area and scrolls on
       * its own, so it is a focus stop for scrolling with the keyboard; on
       * phones it follows the panel's content
       */}
      <article
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        data-scroll-restoration-id="reading"
        className="-mx-panel-inset-phone -mb-7 bg-background px-panel-inset-phone pt-10 pb-16 desktop:absolute desktop:inset-y-0 desktop:right-0 desktop:left-panel desktop:mx-0 desktop:mb-0 desktop:overflow-y-auto desktop:px-0 desktop:pt-0 desktop:pb-0"
      >
        <div className="mx-auto flex max-w-170 flex-col gap-16 desktop:px-10 desktop:pt-14 desktop:pb-24">
          {sections.map((section) => (
            <h2
              key={section}
              className="font-serif text-display-phone desktop:text-display"
            >
              {t(`sections.${section}`)}
            </h2>
          ))}
        </div>
      </article>
    </>
  )
}
