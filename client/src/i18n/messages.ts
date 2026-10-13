import type en from "@messages/en.json"
import { defaultLocale, type Locale } from "./locales"

export type Messages = typeof en

// One file per language, each in its own chunk: only the current one is loaded
const files = import.meta.glob<Messages>("@messages/*.json", {
  import: "default",
})

// By language, from each file's name (`fr.json`)
const byLocale = new Map(
  Object.entries(files).map(([path, load]) => [
    path
      .split("/")
      .at(-1)
      ?.replace(/\.json$/, ""),
    load,
  ])
)

/**
 * The messages of a language. Until a language is translated, it falls back
 * to English.
 */
export function loadMessages(locale: Locale) {
  const load = byLocale.get(locale) ?? byLocale.get(defaultLocale)
  if (!load) {
    throw new Error(`No messages for "${locale}"`)
  }
  return load()
}
