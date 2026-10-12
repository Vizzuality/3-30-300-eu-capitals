import { Link, useParams } from "@tanstack/react-router"
import { useTranslations } from "use-intl"

import { cn } from "@/lib/utils"

// Methodology and About: the current page's link stays highlighted
const navLink = cn(
  "rounded-control p-2.5 text-control text-ink-2 hover:bg-surface-2 hover:text-ink",
  "data-[status=active]:bg-surface-2 data-[status=active]:text-ink"
)

/**
 * The top bar of the panel: the site name (back to Home), Methodology, About
 * and the current language.
 */
export function TopBar() {
  const t = useTranslations("frame")
  const { locale } = useParams({ from: "/$locale" })

  return (
    <header className="flex min-h-top-bar-phone shrink-0 flex-wrap items-center justify-between gap-x-4 pr-3 pl-panel-inset-phone desktop:min-h-top-bar desktop:pr-6 desktop:pl-panel-inset">
      <Link
        to="/$locale"
        params={{ locale }}
        aria-label={t("homeLink")}
        className="rounded-chip py-1.5 font-serif text-heading leading-none font-semibold tracking-[-0.01em] text-ink"
      >
        {t("siteName")}
      </Link>
      <div className="flex items-center gap-0.5">
        <nav aria-label={t("navigation")} className="flex items-center gap-0.5">
          <Link
            to="/$locale/methodology"
            params={{ locale }}
            className={navLink}
          >
            {t("methodology")}
          </Link>
          <Link to="/$locale/about" params={{ locale }} className={navLink}>
            {t("about")}
          </Link>
        </nav>
        {/*
         * The current language, as text: it becomes the button of the
         * language list once there is one to open
         */}
        <p className="ml-1.5 px-2.5 text-small font-semibold tracking-[0.04em] text-ink">
          <span aria-hidden="true">{t("languageCode")}</span>
          <span className="sr-only">{t("language")}</span>
        </p>
      </div>
    </header>
  )
}
