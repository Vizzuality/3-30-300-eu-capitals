/**
 * The 27 capitals of the European Union, by their address on the site
 * (`/en/capitals/brussels`): the English name in lower case, the same in every
 * language. In the order of their countries in the EU's protocol.
 */
export const capitalSlugs = [
  "brussels",
  "sofia",
  "prague",
  "copenhagen",
  "berlin",
  "tallinn",
  "dublin",
  "athens",
  "madrid",
  "paris",
  "zagreb",
  "rome",
  "nicosia",
  "riga",
  "vilnius",
  "luxembourg",
  "budapest",
  "valletta",
  "amsterdam",
  "vienna",
  "warsaw",
  "lisbon",
  "bucharest",
  "ljubljana",
  "bratislava",
  "helsinki",
  "stockholm",
] as const

export type CapitalSlug = (typeof capitalSlugs)[number]

export function isCapitalSlug(value: string): value is CapitalSlug {
  return (capitalSlugs as ReadonlyArray<string>).includes(value)
}
