import { createFileRoute, notFound } from "@tanstack/react-router"
import { useLocale, useTranslations } from "use-intl"

import { NotFoundPage } from "@/components/layout/not-found-page"
import { summaryQuery, useSummary } from "@/data/queries"
import { pageHead } from "@/i18n/head"
import { nameIn } from "@/i18n/names"
import { isCapitalSlug } from "@/lib/capitals"
import { assertLocale } from "@/routes/$locale/-guards"

export const Route = createFileRoute("/$locale/capitals/$slug")({
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

  return (
    <h1 className="font-serif text-title">{nameIn(summary.name, locale)}</h1>
  )
}

function OtherCapitals() {
  const t = useTranslations("capital")

  return (
    <h2 className="text-label text-ink-2 uppercase">{t("otherCapitals")}</h2>
  )
}
