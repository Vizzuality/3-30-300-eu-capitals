import { MVTLayer } from "@deck.gl/geo-layers"
import type { WebMercatorViewport } from "@math.gl/web-mercator"
import { getBounds } from "@math.gl/web-mercator"

import { tileUrlTemplate } from "@/data/api"
import type { CapitalSlug } from "@/lib/capitals"

import type { CityTileContent } from "./city-tile-decode"
import { sharedTile, tileUrl, type TileIndex } from "./tile-decoder"

/*
 * A capital's city map at street level, from its `city.pmtiles` tiles:
 * deck.gl's `MVTLayer` (its tiling, picking and tile-local coordinates),
 * whose tiles are decoded by the site's worker one source layer at a time,
 * so `renderSubLayers` receives each layer apart (`{buildings, streets, …}`)
 * and draws each with its own `GeoJsonLayer`.
 *
 * deck.gl draws a tile layer tile by tile, so a shadow shifted on screen
 * near a tile's edge would be covered by the next tile's ground. The street
 * is therefore drawn by several of these layers, one per drawing group
 * (ground, shadows, buildings and trees, the lifted building's shadow, the
 * lifted building), which share this module's tiles: each is fetched and
 * decoded once, whatever the number of groups.
 */

/** A city tile, fetched and decoded once for every group that draws it */
export const cityTile = (url: string, index: TileIndex) =>
  sharedTile(url, index, { kind: "city" }) as Promise<CityTileContent | null>

export class CityTileLayer extends MVTLayer<Record<string, unknown>> {
  static layerName = "CityTileLayer"

  override getTileData(loadProps: { index: TileIndex }) {
    const template = this.props.data
    if (typeof template !== "string") {
      return Promise.reject(new Error("A tile address template is needed"))
    }
    return cityTile(
      tileUrl(template, loadProps.index),
      loadProps.index
    ) as never
  }
}

/** The tile column and row of a place at a zoom */
function tileOf(longitude: number, latitude: number, z: number) {
  const n = 2 ** z
  const radians = (latitude * Math.PI) / 180
  return [
    Math.floor(((longitude + 180) / 360) * n),
    Math.floor(((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * n),
  ] as const
}

/**
 * Asks for the city tiles a view will draw (at the zoom deck.gl picks for
 * it, within the street level's zooms), so they are ready when the camera
 * gets there
 */
export function prefetchCityTiles({
  slug,
  release,
  viewport,
  zooms = { min: 14, max: 16 },
}: {
  slug: CapitalSlug
  release: string
  viewport: WebMercatorViewport
  zooms?: { min: number; max: number }
}) {
  const z = Math.min(zooms.max, Math.max(zooms.min, Math.round(viewport.zoom)))
  const corners = getBounds(viewport)
  const longitudes = corners.map(([longitude]) => longitude)
  const latitudes = corners.map(([, latitude]) => latitude)
  const [x0, y0] = tileOf(Math.min(...longitudes), Math.max(...latitudes), z)
  const [x1, y1] = tileOf(Math.max(...longitudes), Math.min(...latitudes), z)
  const template = tileUrlTemplate({ kind: "city", slug }, release)
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      void cityTile(tileUrl(template, { x, y, z }), { x, y, z }).catch(
        () => undefined
      )
    }
  }
}
