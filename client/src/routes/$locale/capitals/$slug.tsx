import { createFileRoute, notFound } from "@tanstack/react-router"

import { CapitalHeader } from "@/components/capital/capital-header"
import { OtherCapitals } from "@/components/capital/other-capitals"
import { NextStepGuide } from "@/components/guide/next-step-guide"
import { NotFoundPage } from "@/components/layout/not-found-page"
import {
  capitalsQuery,
  rankingQuery,
  summaryQuery,
  useCapitals,
  useRanking,
  useSummary,
} from "@/data/queries"
import { pageHead } from "@/i18n/head"
import { nameIn } from "@/i18n/names"
import { capitalSearchSchema } from "@/lib/capital-search"
import { isCapitalSlug } from "@/lib/capitals"
import { guideState } from "@/lib/guide"
import { assertLocale } from "@/routes/$locale/-guards"

export const Route = createFileRoute("/$locale/capitals/$slug")({
  // The selected building, its rule and its facade
  validateSearch: capitalSearchSchema,
  beforeLoad: ({ params }) => {
    assertLocale(params.locale)
    if (!isCapitalSlug(params.slug)) {
      throw notFound()
    }
    return { slug: params.slug }
  },
  // The header's figures, and the ranking and outlines of Other capitals,
  // also in the prerendered HTML
  loader: async ({ context }) => {
    const [summary] = await Promise.all([
      context.queryClient.query({
        ...summaryQuery(context.slug),
        staleTime: "static",
      }),
      context.queryClient.query({ ...rankingQuery(), staleTime: "static" }),
      context.queryClient.query({ ...capitalsQuery(), staleTime: "static" }),
    ])
    // A capital the release does not have yet is a missing page
    if (!summary) {
      throw notFound()
    }
    return { name: summary.name }
  },
  head: (context) =>
    pageHead(context, (t) => {
      const capital = context.loaderData
        ? nameIn(context.loaderData.name, context.params.locale)
        : ""
      return {
        title: t("capital.meta.title", { capital }),
        description: t("capital.meta.description", { capital }),
      }
    }),
  // On phones, "Other capitals" comes after the map band
  staticData: { afterMapBand: CapitalNeighbours },
  notFoundComponent: NotFoundPage,
  component: Capital,
})

// The parts of the page that float in, one after the other: the header,
// then the guide, then Other capitals (after the map band on phones)
function Capital() {
  const { slug } = Route.useRouteContext()
  const summary = useSummary(slug)
  const search = Route.useSearch()

  // Until the map reports its view, the address says it: the city overview,
  // or a selected building
  return (
    <>
      <CapitalHeader summary={summary} />
      <NextStepGuide state={guideState({ page: "capital", ...search })} />
    </>
  )
}

function CapitalNeighbours() {
  const { slug } = Route.useRouteContext()
  const ranking = useRanking()
  const { capitals } = useCapitals()

  return <OtherCapitals slug={slug} ranking={ranking} capitals={capitals} />
}
