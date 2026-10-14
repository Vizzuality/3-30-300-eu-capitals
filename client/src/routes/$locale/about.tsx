import { createFileRoute } from "@tanstack/react-router"

import { AboutContent } from "@/components/about/about-content"
import { NotFoundPage } from "@/components/layout/not-found-page"
import { sourcesQuery, useSources } from "@/data/queries"
import { pageHead } from "@/i18n/head"
import { assertLocale } from "./-guards"

export const Route = createFileRoute("/$locale/about")({
  beforeLoad: ({ params }) => assertLocale(params.locale),
  // The data credits come from the release's sources, also in the
  // prerendered HTML
  loader: async ({ context }) => {
    await context.queryClient.query({ ...sourcesQuery(), staleTime: "static" })
  },
  head: (context) =>
    pageHead(context, (t) => ({
      title: t("about.meta.title"),
      description: t("about.meta.description"),
    })),
  // The map keeps showing what it showed; the phone's column leaves it out
  staticData: { mapArea: "hiddenOnPhone" },
  notFoundComponent: NotFoundPage,
  component: About,
})

function About() {
  return <AboutContent sources={useSources()} />
}
