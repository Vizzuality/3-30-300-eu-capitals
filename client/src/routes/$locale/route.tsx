import { Outlet, createFileRoute, useMatches } from "@tanstack/react-router"
import { IntlProvider } from "use-intl"

import { NotFoundPage } from "@/components/layout/not-found-page"
import { SiteFrame } from "@/components/layout/site-frame"
import { layoutHead } from "@/i18n/head"
import { defaultLocale, isLocale, timeZone } from "@/i18n/locales"
import { loadMessages } from "@/i18n/messages"

/*
 * The layout every page shares: the panel's frame and the map area. Pages
 * render only the panel's content, through the `<Outlet />`. The router keeps
 * this component mounted while it stays matched, including when only
 * `$locale` changes, so the map area is never remounted.
 */
export const Route = createFileRoute("/$locale")({
  loader: async ({ params }) => {
    // An unknown language is a 404 (see `-guards.ts`), shown in English
    const locale = isLocale(params.locale) ? params.locale : defaultLocale
    return { locale, messages: await loadMessages(locale) }
  },
  head: layoutHead,
  // When no page matches the rest of the address
  notFoundComponent: NotFoundPage,
  component: LocaleLayout,
})

function LocaleLayout() {
  const { locale, messages } = Route.useLoaderData()

  // The page shown: the last match, unless no page matches or it is not found
  const page = useMatches({
    select: (matches) => {
      const last = matches.at(-1)
      const found =
        last && last.routeId !== Route.id && last.status !== "notFound"
      return found ? last.staticData : undefined
    },
  })

  return (
    <IntlProvider locale={locale} messages={messages} timeZone={timeZone}>
      <SiteFrame
        // The 404 page keeps the map on desktop, like About
        mapArea={page ? (page.mapArea ?? "shown") : "hiddenOnPhone"}
        afterMapBand={page?.afterMapBand}
      >
        <Outlet />
      </SiteFrame>
    </IntlProvider>
  )
}
