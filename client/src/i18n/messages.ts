import type en from "../../messages/en.json"
import { defaultLocale, type Locale } from "./locales"

export type Messages = typeof en

// One file per language, each in its own chunk: only the current one is loaded
const files = import.meta.glob<Messages>("../../messages/*.json", {
  import: "default",
})

/**
 * The messages of a language. Until a language is translated, it falls back
 * to English.
 */
export function loadMessages(locale: Locale) {
  const load =
    files[`../../messages/${locale}.json`] ??
    files[`../../messages/${defaultLocale}.json`]

  return load()
}
