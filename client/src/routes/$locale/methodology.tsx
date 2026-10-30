import { createFileRoute } from "@tanstack/react-router"
import { useTranslations } from "use-intl"

import { BackLink } from "@/components/layout/back-link"
import { NotFoundPage } from "@/components/layout/not-found-page"
import { ReadingPage } from "@/content/methodology/reading-page"
import { TableOfContents } from "@/content/methodology/table-of-contents"
import {
  capitalsQuery,
  sourcesQuery,
  useCapitals,
  useSources,
} from "@/data/queries"
import { pageHead } from "@/i18n/head"
import { assertLocale } from "./-guards"

export const Route = createFileRoute("/$locale/methodology")({
  beforeLoad: ({ params }) => assertLocale(params.locale),
  // The data table and the dates in the text come from the release's
  // sources, and the capitals' names from its capitals, also in the
  // prerendered HTML
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...sourcesQuery(), staleTime: "static" }),
      context.queryClient.query({ ...capitalsQuery(), staleTime: "static" }),
    ])
  },
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

/**
 * The page's content, in its three parts: the back link and the title, the
 * table of contents, then the reading page, which covers the map area on desktop
 */
function Methodology() {
  const t = useTranslations("methodology")

  return (
    <>
      <div className="flex flex-col gap-3.5">
        <BackLink page="methodology" />
        <div className="flex flex-col gap-2.5">
          <p className="text-label text-ink-2 uppercase">{t("label")}</p>
          <h1 className="font-serif text-title">{t("title")}</h1>
        </div>
      </div>
      <div className="flex flex-col gap-block">
        <TableOfContents />
        <p className="text-small text-ink-2">{t("howToRead")}</p>
      </div>
      <ReadingPage sources={useSources()} capitals={useCapitals()} />
    </>
  )
}
