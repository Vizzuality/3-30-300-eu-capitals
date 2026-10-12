import { Link } from "@tanstack/react-router"
import { useLocale, useTranslations } from "use-intl"

/** The 404 page's panel content, in the language of the address */
export function NotFoundPage() {
  const t = useTranslations("notFound")
  const locale = useLocale()

  return (
    <div className="flex flex-col gap-2.5">
      <h1 className="font-serif text-title">{t("title")}</h1>
      <p className="text-ink-2">{t("text")}</p>
      <p>
        <Link
          to="/$locale"
          params={{ locale }}
          className="rounded-chip text-control font-semibold underline decoration-line underline-offset-3 hover:decoration-current"
        >
          {t("home")}
        </Link>
      </p>
    </div>
  )
}
