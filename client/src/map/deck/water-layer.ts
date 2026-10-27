import { tileUrlTemplate } from "@/data/api"
import type { CapitalSlug } from "@/lib/capitals"
import type { MapColors } from "@/map/map-colors"
import { LocalMVTLayer } from "./local-mvt-layer"
import type { OverviewStyle } from "./reveal-extension"

/*
 * The water of the city overview: the sea, lakes and rivers of the map
 * around the city, inside the city or not, all in the Water colour, from the
 * capital's context tiles. They cover the overview's rectangle; outside the
 * city and its 1 km band, water too narrow to see at the overview's zooms is
 * left out of them. Drawn over the grid, so shores inside the city stay
 * sharp where the 10 m squares would blur them.
 */
export function waterLayer({
  slug,
  release,
  colors,
  zooms,
  extent,
  overview,
}: {
  slug: CapitalSlug
  release: string
  colors: MapColors
  /** The zooms of the capital's context tiles */
  zooms: readonly [number, number]
  /** The overview's rectangle: west, south, east, north */
  extent: readonly [number, number, number, number]
  /** At street level, its opacity and its rings */
  overview?: OverviewStyle
}) {
  return new LocalMVTLayer({
    ...overview,
    id: `water-${slug}`,
    data: tileUrlTemplate({ kind: "context", slug }, release),
    minZoom: zooms[0],
    maxZoom: zooms[1],
    extent: [...extent],
    filled: true,
    stroked: false,
    getFillColor: colors.water,
    // The colour scheme, which draws the tiles again in its colours
    updateTriggers: { renderSubLayers: colors.water.join() },
  })
}
