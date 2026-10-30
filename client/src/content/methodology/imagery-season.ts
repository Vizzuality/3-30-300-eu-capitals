import { useFormatter, useLocale, useTranslations } from "use-intl"

import type { Capitals, Sources } from "@/data/schemas"
import { nameIn } from "@/i18n/names"
import type { CapitalSlug } from "@/lib/capitals"
import { imageryDates, leafOffImagery } from "@/lib/imagery-season"
import { useSourceDateFormat } from "./data-table"

/**
 * The capitals whose imagery was taken outside full leaf, for the limit
 * that names them: each in the visitor's language, with the months of its
 * imagery from the release ("Valletta (January 2020)"), as lists, and which
 * of the two lists there are
 */
export function useImagerySeason(sources: Sources, capitals: Capitals) {
  const t = useTranslations("methodology.limits.data")
  const format = useFormatter()
  const locale = useLocale()
  const formatDate = useSourceDateFormat()

  const listOf = (slugs: ReadonlyArray<CapitalSlug>) =>
    format.list(
      imageryDates(sources.capitals, slugs).flatMap(({ slug, months }) => {
        const capital = capitals.capitals.find((item) => item.slug === slug)
        if (!capital) {
          return []
        }
        return [
          t("seasonCapital", {
            capital: nameIn(capital.name, locale),
            dated: months ? "yes" : "no",
            months: months ? formatDate(months) : "",
          }),
        ]
      }),
      { type: "conjunction" }
    )

  const whole = listOf(leafOffImagery.whole)
  const part = listOf(leafOffImagery.part)
  return {
    groups: !part ? "whole" : !whole ? "part" : "both",
    whole,
    part,
    // Whether any capital is named: the limit is left out otherwise
    named: Boolean(whole || part),
  }
}
