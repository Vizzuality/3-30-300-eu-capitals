import { createTranslator } from "use-intl"

import { defaultLocale, isLocale, timeZone } from "./locales"
import type { Messages } from "./messages"

type Translator = ReturnType<typeof createTranslator<Messages>>

/** What a route's `head` receives, as far as these helpers need it */
type HeadContext = {
  match: { routeId: string; status: string }
  matches: ReadonlyArray<{ routeId: string; loaderData?: unknown }>
  params: { locale: string }
}

/*
 * The messages are loaded once, by the `/$locale` layout's loader; each page's
 * `head` reads them from that match.
 */
function translator({ matches, params }: HeadContext): Translator {
  const layout = matches.find(({ routeId }) => routeId === "/$locale")
  const data = layout?.loaderData as { messages: Messages } | undefined
  if (!data) {
    throw new Error("The messages of the /$locale layout are not loaded")
  }

  return createTranslator({
    locale: isLocale(params.locale) ? params.locale : defaultLocale,
    messages: data.messages,
    timeZone,
  })
}

/** The 404 page is not indexed */
function notFoundHead(t: Translator) {
  return {
    meta: [
      { title: t("notFound.meta.title") },
      { name: "robots", content: "noindex" },
    ],
  }
}

/**
 * The `<title>` and meta description of a page, written for search engines in
 * the page's language, or those of the 404 page when the page is not found.
 */
export function pageHead(
  context: HeadContext,
  describe: (t: Translator) => { title: string; description: string }
) {
  const t = translator(context)
  if (context.match.status === "notFound") {
    return notFoundHead(t)
  }

  const { title, description } = describe(t)
  return {
    meta: [{ title }, { name: "description", content: description }],
  }
}

/**
 * The head of the `/$locale` layout itself: only used when no page matches the
 * address under it, which is then the 404 page.
 */
export function layoutHead(context: HeadContext) {
  const isLeaf = context.matches.at(-1)?.routeId === context.match.routeId
  return isLeaf ? notFoundHead(translator(context)) : {}
}
