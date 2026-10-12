import { createFileRoute, notFound } from "@tanstack/react-router"
import { useTranslations } from "use-intl"

import { NotFoundPage } from "@/components/layout/not-found-page"
import { pageHead } from "@/i18n/head"
import { isCapitalSlug } from "@/lib/capitals"
import { assertLocale } from "../-guards"

export const Route = createFileRoute("/$locale/capitals/$slug")({
  beforeLoad: ({ params }) => {
    assertLocale(params.locale)
    if (!isCapitalSlug(params.slug)) {
      throw notFound()
    }
    return { slug: params.slug }
  },
  head: (context) =>
    pageHead(context, (t) => {
      // Stand-in names until the capitals' data brings them in every language
      const capital = t(`temporaryCapitalNames.${context.match.context.slug}`)
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
  const t = useTranslations()
  const { slug } = Route.useRouteContext()

  return (
    <h1 className="font-serif text-title">
      {t(`temporaryCapitalNames.${slug}`)}
    </h1>
  )
}

function OtherCapitals() {
  const t = useTranslations("capital")

  return (
    <h2 className="text-label text-ink-2 uppercase">{t("otherCapitals")}</h2>
  )
}
