import { useTranslations } from "use-intl"

/**
 * The footer: one line pinned at the bottom of the panel on desktop, the end
 * of the page on phones.
 */
export function SiteFooter() {
  const t = useTranslations("frame")

  return (
    <footer className="flex shrink-0 flex-col items-start gap-x-3 bg-surface-2 px-panel-inset-phone pt-5 pb-7 text-small text-ink-2 desktop:flex-row desktop:items-center desktop:justify-between desktop:border-t desktop:border-line desktop:bg-transparent desktop:px-panel-inset desktop:pt-3 desktop:pb-3.5">
      <p>{t("madeBy")}</p>
    </footer>
  )
}
