import { MVTLayer } from "@deck.gl/geo-layers"

import { loadTile, tileUrl, type TileIndex } from "./tile-decoder"

/*
 * deck.gl's `MVTLayer`, with its tiles decoded by the site's own worker
 * instead of loaders.gl's, which `MVTLayer` would fetch from a CDN: every
 * script the map runs comes from the site. Its tiling, drawing and picking
 * are `MVTLayer`'s own.
 */
export class LocalMVTLayer<
  FeaturePropertiesT = Record<string, unknown>,
> extends MVTLayer<FeaturePropertiesT> {
  static layerName = "LocalMVTLayer"

  override getTileData(loadProps: { index: TileIndex; signal?: AbortSignal }) {
    const template = this.props.data
    if (typeof template !== "string") {
      return Promise.reject(new Error("A tile address template is needed"))
    }
    const { index, signal } = loadProps
    return loadTile(
      tileUrl(template, index),
      index,
      { kind: this.props.binary ? "binary" : "geojson" },
      signal
    ) as never
  }
}
