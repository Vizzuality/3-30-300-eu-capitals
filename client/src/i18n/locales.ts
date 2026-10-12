/**
 * The 24 official languages of the European Union, by their ISO 639-1 code:
 * the first segment of every address
 */
export const locales = [
  "bg",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "et",
  "fi",
  "fr",
  "ga",
  "hr",
  "hu",
  "it",
  "lt",
  "lv",
  "mt",
  "nl",
  "pl",
  "pt",
  "ro",
  "sk",
  "sl",
  "sv",
] as const

export type Locale = (typeof locales)[number]

/** The source language, and the fallback of every message not translated yet */
export const defaultLocale = "en" satisfies Locale

/**
 * The time zone dates are written in, the same on the server and in the
 * browser so prerendered pages match what the browser renders
 */
export const timeZone = "Europe/Stockholm"

export function isLocale(value: string): value is Locale {
  return (locales as ReadonlyArray<string>).includes(value)
}
