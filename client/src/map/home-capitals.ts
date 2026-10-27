import { addMetersToLngLat } from "@math.gl/web-mercator"

import type { Capital, Ranking } from "@/data/schemas"
import { nameIn } from "@/i18n/names"
import type { CapitalSlug } from "@/lib/capitals"

/*
 * The 27 capitals as the Home map shows them: each real outline enlarged
 * (`scale`) around the place it is drawn (`display`), with a leader line
 * back to its true position when it had to be moved, and its name in the
 * visitor's language. The keyboard goes through them in the order of the
 * ranking.
 */

/**
 * The zoom from which the names show under the outlines: the capitals are
 * laid out for Europe across a desktop map (about zoom 3.7); farther out,
 * as on the phone's map band, the names would run into each other
 */
export const namesFromZoom = 3.2

/** Longitude and latitude, in degrees */
export type LngLat = [longitude: number, latitude: number]

export type HomeCapital = {
  slug: CapitalSlug
  /** In the visitor's language */
  name: string
  country: string
  /** Its rank, from the ranking (or its place among the capitals) */
  rank: number
  /** The share of its residents meeting all three rules, from 0 to 1 */
  share: number | undefined
  /** Where its outline is drawn */
  display: LngLat
  /** The outline, in metres from its centre, drawn `scale` times larger */
  outline: Capital["outline"]
  scale: number
  /** From its true position to the nearest point of its moved outline */
  leader: [LngLat, LngLat] | undefined
  /** The middles of the top and bottom edges of the drawn outline */
  top: LngLat
  bottom: LngLat
}

/** The drawn outline's top and bottom middles, in metres from its centre */
function outlineEdges(outline: Capital["outline"]) {
  const points = outline.flat(2)
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const middle = (Math.min(...xs) + Math.max(...xs)) / 2
  return {
    top: [middle, Math.max(...ys)] as const,
    bottom: [middle, Math.min(...ys)] as const,
  }
}

/**
 * The capitals of the release as the Home map draws them, in the order of
 * the ranking (any capital the ranking lacks comes last), with their names
 * in the visitor's language
 */
export function homeCapitals(
  capitals: ReadonlyArray<Capital>,
  ranking: Ranking | undefined | null,
  locale: string
): Array<HomeCapital> {
  const rows = new Map(ranking?.capitals.map((row) => [row.slug, row]))
  const order = (slug: CapitalSlug) =>
    rows.get(slug)?.rank ?? Number.POSITIVE_INFINITY

  const ordered = [...capitals]
  ordered.sort((a, b) => order(a.slug) - order(b.slug))
  return ordered.map((capital, index) => {
    const row = rows.get(capital.slug)
    const edges = outlineEdges(capital.outline)
    const at = ([x, y]: readonly [number, number]) =>
      addMetersToLngLat(capital.display, [
        x * capital.scale,
        y * capital.scale,
      ]) as LngLat
    return {
      slug: capital.slug,
      name: nameIn(capital.name, locale),
      country: nameIn(capital.country.name, locale),
      rank: row?.rank ?? index + 1,
      share: row?.shares.met[3],
      display: capital.display,
      outline: capital.outline,
      scale: capital.scale,
      leader: capital.leader ? [capital.centre, capital.leader] : undefined,
      top: at(edges.top),
      bottom: at(edges.bottom),
    }
  })
}

/** Every character of the names, once each: the map's font atlas for them */
export function nameCharacters(names: ReadonlyArray<string>) {
  const characters = [...new Set(names.join(""))]
  characters.sort()
  return characters.join("")
}

/**
 * Where Tab (or Shift+Tab, `backwards`) goes among the capitals in `order`
 * from the one in focus (none while the map itself has focus): to the next
 * capital, back to the map itself (Shift+Tab from the first), or out of the
 * map (`leaves`: Tab after the last, Shift+Tab from the map itself), so the
 * keys never trap the focus. A map just entered backwards (Shift+Tab from
 * what follows it, `fromEnd`) is gone through from its last item, as Tab
 * goes through it from its first.
 */
export function capitalStep<Item = CapitalSlug>(
  order: ReadonlyArray<Item>,
  current: Item | undefined,
  backwards: boolean,
  fromEnd = false
): { next: Item | undefined; leaves: boolean } {
  const index = current === undefined ? -1 : order.indexOf(current)
  if (index === -1) {
    if (order.length === 0 || (backwards && !fromEnd)) {
      return { next: undefined, leaves: true }
    }
    return { next: backwards ? order.at(-1) : order[0], leaves: false }
  }
  const next = index + (backwards ? -1 : 1)
  if (next >= order.length) {
    return { next: undefined, leaves: true }
  }
  return { next: next < 0 ? undefined : order[next], leaves: false }
}
