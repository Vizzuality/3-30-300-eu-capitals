import { createFileRoute, notFound } from "@tanstack/react-router"
import { useLocale, useTranslations } from "use-intl"

import { NextStepGuide } from "@/components/guide/next-step-guide"
import { NotFoundPage } from "@/components/layout/not-found-page"
import { summaryQuery, useSummary } from "@/data/queries"
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
  loader: async ({ context }) => {
    // A capital the release does not have yet is a missing page
    const summary = await context.queryClient.query({
      ...summaryQuery(context.slug),
      staleTime: "static",
    })
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
  staticData: { afterMapBand: OtherCapitals },
  notFoundComponent: NotFoundPage,
  component: Capital,
})

function Capital() {
  const locale = useLocale()
  const { slug } = Route.useRouteContext()
  const summary = useSummary(slug)
  const search = Route.useSearch()

  // Until the map reports its view, the address says it: the city overview,
  // or a selected building
  return (
    <>
      <h1 className="font-serif text-title">{nameIn(summary.name, locale)}</h1>
      <NextStepGuide state={guideState({ page: "capital", ...search })} />
    </>
  )
}

function OtherCapitals() {
  const t = useTranslations("capital")

  return (
    <h2 className="text-label text-ink-2 uppercase">{t("otherCapitals")}</h2>
  )
}
