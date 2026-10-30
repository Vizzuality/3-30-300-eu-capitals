import { useLocation, useRouter } from "@tanstack/react-router"
import type { MouseEvent } from "react"
import { useLocale, useTranslations } from "use-intl"

import { ChevronLeftIcon } from "@/components/icons"
import { TouchLink } from "@/components/motion/touch-link"
import { buttonVariants } from "@/components/ui/button"
import { useHydrated } from "@/hooks/use-hydrated"
import {
  backTarget,
  historyEntry,
  homeOrigin,
  returnsByHistory,
  type PageOrigin,
  type PageWithBackLink,
} from "@/lib/page-origin"

const backClassName = buttonVariants({
  variant: "quiet",
  className: "-ml-1.5 self-start",
})

/**
 * Back from About or Methodology (`page`) to the page it was opened from
 * (see `backTarget`), named after it, in the language shown; Home when it
 * was opened directly. Both pages follow the same rule. When that page is the previous entry of the history, it goes
 * back in the history, as the browser's back button does. The server, which
 * cannot know where the page was opened from, renders the link to Home; the
 * browser updates it once it has taken the page over. `origin` sets the
 * target instead (the kit page shows each one).
 */
export function BackLink({
  page,
  origin,
}: {
  page: PageWithBackLink
  origin?: PageOrigin
}) {
  const t = useTranslations("frame")
  const locale = useLocale()
  const router = useRouter()
  const hydrated = useHydrated()
  const state = useLocation({ select: (location) => location.state })
  const target =
    origin ?? (hydrated ? backTarget(state.openedFrom, page) : homeOrigin)

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const plain =
      event.button === 0 &&
      !(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
    if (plain && returnsByHistory(target, historyEntry(state))) {
      event.preventDefault()
      router.history.back()
    }
  }

  const label = (
    <>
      <ChevronLeftIcon data-icon="inline-start" />
      {t("back", { page: target.page })}
    </>
  )

  switch (target.page) {
    case "methodology":
      return (
        <TouchLink
          to="/$locale/methodology"
          params={{ locale }}
          onClick={onClick}
          className={backClassName}
        >
          {label}
        </TouchLink>
      )
    case "about":
      return (
        <TouchLink
          to="/$locale/about"
          params={{ locale }}
          onClick={onClick}
          className={backClassName}
        >
          {label}
        </TouchLink>
      )
    case "capital":
      return (
        <TouchLink
          to="/$locale/capitals/$slug"
          params={{ locale, slug: target.slug }}
          search={target.search}
          onClick={onClick}
          className={backClassName}
        >
          {label}
        </TouchLink>
      )
    default:
      return (
        <TouchLink
          to="/$locale"
          params={{ locale }}
          search={target.search}
          // Home is not this page, though its address starts this page's
          activeOptions={{ exact: true }}
          onClick={onClick}
          className={backClassName}
        >
          {label}
        </TouchLink>
      )
  }
}
