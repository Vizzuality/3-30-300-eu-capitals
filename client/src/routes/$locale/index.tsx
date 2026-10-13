import { createFileRoute } from "@tanstack/react-router"

import { NextStepGuide } from "@/components/guide/next-step-guide"
import { HomeIntro } from "@/components/home/home-intro"
import { HomeRanking } from "@/components/home/home-ranking"
import { NotFoundPage } from "@/components/layout/not-found-page"
import { capitalsQuery, rankingQuery } from "@/data/queries"
import { pageHead } from "@/i18n/head"
import { guideState } from "@/lib/guide"
import { assertLocale } from "./-guards"

export const Route = createFileRoute("/$locale/")({
  beforeLoad: ({ params }) => assertLocale(params.locale),
  // The ranking is part of the page, also in its prerendered HTML, with the
  // capitals' outlines
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
  // On phones, the ranking comes after the map band
  staticData: { afterMapBand: HomeRanking },
  notFoundComponent: NotFoundPage,
  component: Home,
})

// The parts of the page that float in, one after the other: the intro, then
// the guide, then the ranking (after the map band on phones)
function Home() {
  return (
    <>
      <HomeIntro />
      <NextStepGuide state={guideState({ page: "home" })} />
    </>
  )
}
