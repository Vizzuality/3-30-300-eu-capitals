import { createFileRoute, stripSearchParams } from "@tanstack/react-router"

import { NextStepGuide } from "@/components/guide/next-step-guide"
import { HomeIntro } from "@/components/home/home-intro"
import { HomeTabs } from "@/components/home/home-tabs"
import { NotFoundPage } from "@/components/layout/not-found-page"
import { capitalsQuery, rankingQuery } from "@/data/queries"
import { pageHead } from "@/i18n/head"
import { guideState } from "@/lib/guide"
import { homeSearchDefaults, homeSearchSchema } from "@/lib/home-search"
import { assertLocale } from "./-guards"

export const Route = createFileRoute("/$locale/")({
  // The tab open under the guide; the ranking, by default, is left out of
  // the address
  validateSearch: homeSearchSchema,
  search: { middlewares: [stripSearchParams(homeSearchDefaults)] },
  beforeLoad: ({ params }) => assertLocale(params.locale),
  // The ranking is part of the page, also in its prerendered HTML, with the
  // capitals' outlines and names for the A–Z list. Nothing depends on the
  // address's tab, so switching tabs loads nothing.
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...rankingQuery(), staleTime: "static" }),
      context.queryClient.query({ ...capitalsQuery(), staleTime: "static" }),
    ])
  },
  head: (context) =>
    pageHead(context, (t) => ({
      title: t("home.meta.title"),
      description: t("home.meta.description"),
    })),
  // On phones, the tabs come after the map band
  staticData: { afterMapBand: HomeTabs },
  notFoundComponent: NotFoundPage,
  component: Home,
})

// The parts of the page that float in, one after the other: the intro, then
// the guide, then the tabs (after the map band on phones)
function Home() {
  return (
    <>
      <HomeIntro />
      <NextStepGuide state={guideState({ page: "home" })} />
    </>
  )
}
