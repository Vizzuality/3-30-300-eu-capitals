import type { Names } from "@/data/schemas"
import { defaultLocale, isLocale } from "./locales"

/**
 * A capital's or country's name in the page's language, from the release
 * data, which has every language. An unknown language uses English.
 */
export function nameIn(names: Names, locale: string) {
  return names[isLocale(locale) ? locale : defaultLocale]
}
