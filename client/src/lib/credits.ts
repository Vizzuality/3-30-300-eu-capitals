import type { Sources } from "@/data/schemas"

/*
 * The data credits of the About page, from the release's sources: each
 * source named as its publisher writes it, with the attribution its licence
 * asks for, written as it must be, and its licence. Sources that share the
 * same attribution and licence (OpenStreetMap and its land polygons) make
 * one credit, so the same line is not repeated. An attribution that only
 * repeats the source's name (Wikidata) is left out.
 */

export type Credit = {
  sources: Array<{ name: string; url: string }>
  attribution: string | undefined
  licence: { name: string; url: string }
}

type Source = Sources["sources"][number]

export function creditsOf(sources: ReadonlyArray<Source | undefined>) {
  const credits: Array<Credit & { key: string }> = []

  for (const source of sources) {
    if (!source) {
      continue
    }
    const key = `${source.attribution}\n${source.licence}\n${source.licence_url}`
    const named = { name: source.name, url: source.url }
    const credit = credits.find((item) => item.key === key)
    if (credit) {
      credit.sources.push(named)
      continue
    }
    credits.push({
      key,
      sources: [named],
      attribution: source.attribution,
      licence: { name: source.licence, url: source.licence_url },
    })
  }

  return credits.map(
    ({ key: _key, sources: named, attribution, licence }): Credit => ({
      sources: named,
      attribution:
        named.length === 1 && named[0].name === attribution
          ? undefined
          : attribution,
      licence,
    })
  )
}
