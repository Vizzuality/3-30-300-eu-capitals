import { useLocale, useTranslations } from "use-intl"

import { TouchLink } from "@/components/motion/touch-link"
import { buttonVariants } from "@/components/ui/button"

/** The 404 page's panel content, in the language of the address */
export function NotFoundPage() {
  const t = useTranslations("notFound")
  const locale = useLocale()

  return (
    <div className="flex flex-col gap-2.5">
      <h1 className="font-serif text-title">{t("title")}</h1>
      <p className="text-ink-2">{t("text")}</p>
      <p className="mt-2">
        <TouchLink
          to="/$locale"
          params={{ locale }}
          className={buttonVariants({ variant: "secondary" })}
        >
          {t("home")}
        </TouchLink>
      </p>
    </div>
  )
}
