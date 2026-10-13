import { createFileRoute } from "@tanstack/react-router"
import { useTranslations } from "use-intl"

import { NotFoundPage } from "@/components/layout/not-found-page"
import { rankingQuery } from "@/data/queries"
import { pageHead } from "@/i18n/head"
import { assertLocale } from "./-guards"

export const Route = createFileRoute("/$locale/")({
  beforeLoad: ({ params }) => assertLocale(params.locale),
  // The ranking is part of the page, also in its prerendered HTML
  loader: async ({ context }) => {
    await context.queryClient.query({ ...rankingQuery(), staleTime: "static" })
  },
  head: (context) =>
    pageHead(context, (t) => ({
      title: t("home.meta.title"),
      description: t("home.meta.description"),
    })),
  notFoundComponent: NotFoundPage,
  component: Home,
})

function Home() {
  const t = useTranslations("home")

  return (
    <h1 className="font-serif text-display-phone desktop:text-display">
      {t("title")}
    </h1>
  )
}
