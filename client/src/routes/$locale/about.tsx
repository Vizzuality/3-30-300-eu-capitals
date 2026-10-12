import { createFileRoute } from "@tanstack/react-router"
import { useTranslations } from "use-intl"

import { NotFoundPage } from "@/components/layout/not-found-page"
import { pageHead } from "@/i18n/head"
import { assertLocale } from "./-guards"

export const Route = createFileRoute("/$locale/about")({
  beforeLoad: ({ params }) => assertLocale(params.locale),
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
  const t = useTranslations("about")

  return (
    <>
      <h1 className="font-serif text-title">{t("title")}</h1>
      <h2 className="font-serif text-heading">{t("basedOn")}</h2>
      <h2 className="font-serif text-heading">{t("credits")}</h2>
      <h2 className="font-serif text-heading">{t("links")}</h2>
    </>
  )
}
