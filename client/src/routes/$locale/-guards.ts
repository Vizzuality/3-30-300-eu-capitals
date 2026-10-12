import { notFound } from "@tanstack/react-router"

import { isLocale } from "@/i18n/locales"

/**
 * Every page under `/$locale` checks the language of its address, so an
 * unknown one is a 404 shown inside the shared layout, which then uses
 * English. Each page also has the 404 page as its own `notFoundComponent`:
 * without it, the layout would be the boundary and its frame would be
 * replaced.
 */
export function assertLocale(locale: string) {
  if (!isLocale(locale)) {
    throw notFound()
  }
}
