import {
  createFileRoute,
  notFound,
  stripSearchParams,
} from "@tanstack/react-router"
import { useCallback, useEffect, useMemo } from "react"

import { CapitalHeader } from "@/components/capital/capital-header"
import { MiddleBlock } from "@/components/capital/middle-block"
import { OtherCapitals } from "@/components/capital/other-capitals"
import { NextStepGuide } from "@/components/guide/next-step-guide"
import { NotFoundPage } from "@/components/layout/not-found-page"
import { MapLegend } from "@/components/map/map-legend"
import {
  capitalsQuery,
  rankingQuery,
  summaryQuery,
  useCapitals,
  useRanking,
  useSummary,
} from "@/data/queries"
import { standInBuilding } from "@/data/stand-in-buildings"
import { pageHead } from "@/i18n/head"
import { nameIn } from "@/i18n/names"
import {
  capitalSearchDefaults,
  capitalSearchSchema,
} from "@/lib/capital-search"
import { capitalView, guideInput } from "@/lib/capital-view"
import { isCapitalSlug } from "@/lib/capitals"
import { guideState } from "@/lib/guide"
import { capitalLegend, drawnLegend } from "@/lib/map-legend"
import { cityTileArea } from "@/map/capital-archives"
import { env } from "@/env"
import type { Rule } from "@/lib/rules"
import { assertLocale } from "@/routes/$locale/-guards"

export const Route = createFileRoute("/$locale/capitals/$slug")({
  // The selected building, its rule and its facade, and the area in view;
  // the 3 trees rule, shown by default, is left out of links
  validateSearch: capitalSearchSchema,
  search: { middlewares: [stripSearchParams(capitalSearchDefaults)] },
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
  // On phones, the middle block and "Other capitals" come after the map band
  staticData: { afterMapBand: CapitalAfterBand },
  notFoundComponent: NotFoundPage,
  component: Capital,
})

/**
 * What the page shows, from its address: the city overview, the street or a
 * selected building. Until the map reads a building's figures from the
 * city's tiles, only the stand-in release's buildings can be selected.
 */
function useCapitalView() {
  const { slug } = Route.useRouteContext()
  const search = Route.useSearch()

  return useMemo(
    () =>
      capitalView(
        search,
        search.building === undefined
          ? undefined
          : standInBuilding(slug, search.building)
      ),
    [slug, search]
  )
}

// The parts of the page that float in, one after the other: the header,
// then the guide, then the middle block and Other capitals (after the map
// band on phones)
function Capital() {
  const { slug } = Route.useRouteContext()
  const summary = useSummary(slug)
  const view = useCapitalView()

  return (
    <>
      <CapitalHeader summary={summary} />
      <NextStepGuide state={guideState(guideInput(view))} />
    </>
  )
}

function CapitalAfterBand() {
  const { slug } = Route.useRouteContext()
  const summary = useSummary(slug)
  const ranking = useRanking()
  const { capitals } = useCapitals()
  const view = useCapitalView()
  const navigate = Route.useNavigate()
  const selected = view.view === "building"

  // Each rule shown is a step back in the browser's history. A facade is
  // only shown with the 3 trees rule, so another rule leaves it.
  const showRule = useCallback(
    (rule: Rule) =>
      navigate({
        search: (previous) => ({ ...previous, rule, facade: undefined }),
        resetScroll: false,
      }),
    [navigate]
  )

  // Back to the street, without the building or its facade
  const close = useCallback(
    () =>
      navigate({
        search: (previous) => ({
          ...previous,
          building: undefined,
          facade: undefined,
        }),
        resetScroll: false,
      }),
    [navigate]
  )

  // Escape closes the building too, unless something else answered it
  useEffect(() => {
    if (!selected) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        close()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [selected, close])

  return (
    <>
      {/* The map's legend, under its band on phones */}
      <MapLegend
        view={drawnLegend(
          capitalLegend(view),
          cityTileArea(summary, env.VITE_DATA_RELEASE) !== undefined
        )}
        variant="band"
        className="desktop:hidden"
      />
      <MiddleBlock
        view={view}
        shares={summary.shares.rules}
        language={summary.language}
        onRuleChange={showRule}
        onClose={close}
      />
      <OtherCapitals slug={slug} ranking={ranking} capitals={capitals} />
    </>
  )
}
