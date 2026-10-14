import { creditKey, type Source } from "@/lib/credits"

/*
 * The map's attribution, bottom left: the sources of what the map draws,
 * from the release's sources, each linked to its page. The About page holds
 * every credit in full; the map names the sources it is drawn from:
 * - Home: the capitals' outlines (OpenStreetMap) on Natural Earth's
 *   countries. Natural Earth is public domain and needs no credit, but it is
 *   what Home is drawn from.
 * - A capital: its outline, water, coast, parks and paths (OpenStreetMap),
 *   its buildings (Overture) and its trees and canopy (Meta and WRI).
 * Each is named briefly, so the line fits the narrowest phone band:
 * "© OpenStreetMap · Overture · Meta & WRI". OpenStreetMap comes first, as
 * its licence (ODbL) asks for, and always links to its copyright page.
 * Sources sharing one attribution under one licence (OpenStreetMap and its
 * land polygons) are named once. A source missing from the release is left
 * out.
 */

/** Where OpenStreetMap's credit links, whichever of its sources it names */
export const osmCopyright = "https://www.openstreetmap.org/copyright"

const osmSources: ReadonlyArray<string> = ["osm", "osm_land_polygons"]

export type SourceId = Source["id"]

/** Which map the attribution is for: Europe on Home, or a capital */
export type AttributionMap = "home" | "capital"

const drawnFrom: Record<AttributionMap, ReadonlyArray<SourceId>> = {
  home: ["osm", "natural_earth"],
  capital: ["osm", "osm_land_polygons", "overture_buildings", "canopy_height"],
}

export type AttributionItem = { id: SourceId; url: string }

/** The sources the map credits, in order, from the release's sources */
export function mapAttribution(
  map: AttributionMap,
  sources: ReadonlyArray<Source | undefined>
): Array<AttributionItem> {
  const seen = new Set<string>()
  const items: Array<AttributionItem> = []

  for (const id of drawnFrom[map]) {
    const source = sources.find((item) => item?.id === id)
    if (!source) {
      continue
    }
    const key = creditKey(source)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    items.push({
      id: source.id,
      url: osmSources.includes(source.id) ? osmCopyright : source.url,
    })
  }

  return items
}
