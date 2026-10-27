import { MVTLayer } from "@deck.gl/geo-layers"

import type { ContextTileContent } from "./context-tile-decode"
import { sharedTile, tileUrl, type TileIndex } from "./tile-decoder"

/*
 * A capital's overview map, from its `context.pmtiles` tiles: deck.gl's
 * `MVTLayer`, whose tiles are decoded by the site's worker one source layer
 * at a time (water, roads, and the district names as candidates), so each
 * drawing group (the water, the roads' casings, the roads) draws its own
 * layer from the same tiles, fetched and decoded once.
 */
export class ContextTileLayer extends MVTLayer<Record<string, unknown>> {
  static layerName = "ContextTileLayer"

  override getTileData(loadProps: { index: TileIndex }) {
    const template = this.props.data
    if (typeof template !== "string") {
      return Promise.reject(new Error("A tile address template is needed"))
    }
    const { index } = loadProps
    return sharedTile(tileUrl(template, index), index, {
      kind: "context",
    }) as Promise<ContextTileContent | null> as never
  }
}
