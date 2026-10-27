import { LayerExtension, type Layer } from "@deck.gl/core"
import { TileLayer } from "@deck.gl/geo-layers"
import { BitmapLayer } from "@deck.gl/layers"

import { tileUrlTemplate } from "@/data/api"
import type { CapitalSlug } from "@/lib/capitals"
import type { MapColors, Rgba } from "@/map/map-colors"
import type { OverviewStyle } from "./reveal-extension"

/*
 * The city overview's 10 m grid, from the capital's grid tiles: 512 px
 * images whose pixels hold the number of rules met by the square under them
 * (0 to 3), or 4 for no colour (water, and outside the city), never colours.
 * The GPU gives each value its result colour as it draws, so light and dark
 * share one set of tiles and a change of colour scheme loads nothing.
 *
 * Each tile is a `BitmapLayer` sampled to the nearest pixel, so squares
 * stay crisp however far the map enlarges them. deck.gl's `BitmapLayer` can
 * tint or desaturate an image but has no colour lookup, hence a small
 * extension of our own, `GridPaletteExtension`.
 */

/** The four result colours, from no rule met to all three, in 0–255 */
export type GridPaletteProps = {
  gridPalette?: readonly [Rgba, Rgba, Rgba, Rgba]
}

const gridPaletteModule = {
  name: "gridPalette",
  fs: /* glsl */ `
layout(std140) uniform gridPaletteUniforms {
  vec4 result0;
  vec4 result1;
  vec4 result2;
  vec4 result3;
} gridPalette;
`,
  uniformTypes: {
    result0: "vec4<f32>",
    result1: "vec4<f32>",
    result2: "vec4<f32>",
    result3: "vec4<f32>",
  },
} as const

/**
 * Reads each pixel's value from its red channel and draws it in its result
 * colour; value 4 is not drawn. A value that is not a whole number from 0 to
 * 4 is drawn magenta, so any change of the values on their way (decoding,
 * colour management, filtering) shows at once. The layer's opacity is kept,
 * so the grid can fade.
 */
export class GridPaletteExtension extends LayerExtension {
  static defaultProps = {
    gridPalette: [
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
    ],
  }
  static extensionName = "GridPaletteExtension"

  getShaders() {
    return {
      modules: [gridPaletteModule],
      inject: {
        "fs:DECKGL_FILTER_COLOR": /* glsl */ `
  float value = color.r * 255.0;
  float whole = floor(value + 0.5);
  if (abs(value - whole) > 0.02 || whole > 4.0) {
    color = vec4(1.0, 0.0, 1.0, 1.0);
  } else if (whole > 3.5) {
    discard;
  } else {
    vec4 result = whole < 0.5 ? gridPalette.result0
      : whole < 1.5 ? gridPalette.result1
      : whole < 2.5 ? gridPalette.result2
      : gridPalette.result3;
    color = vec4(result.rgb, result.a * color.a);
  }
`,
      },
    }
  }

  draw(this: Layer<GridPaletteProps>) {
    const palette =
      this.props.gridPalette ?? GridPaletteExtension.defaultProps.gridPalette
    const [result0, result1, result2, result3] = palette.map((color) =>
      color.map((channel) => channel / 255)
    )
    this.setShaderModuleProps({
      gridPalette: { result0, result1, result2, result3 },
    })
  }
}

const gridPalette = new GridPaletteExtension()

/**
 * A grid tile as the values it holds: decoded without any colour
 * conversion, so every pixel keeps its value; null for a place with nothing
 * in it (the data API's 204)
 */
async function gridTile({
  url,
  signal,
}: {
  url?: string | null
  signal?: AbortSignal
}): Promise<ImageBitmap | null> {
  if (!url) {
    return null
  }
  const response = await fetch(url, { signal })
  if (response.status === 204) {
    return null
  }
  if (!response.ok) {
    throw new Error(`The data API answered ${response.status} for ${url}`)
  }
  return createImageBitmap(await response.blob(), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  })
}

export function gridLayer({
  slug,
  release,
  colors,
  zooms,
  extent,
  onViewportLoad,
  overview,
}: {
  slug: CapitalSlug
  release: string
  colors: MapColors
  /** The zooms of the capital's grid tiles */
  zooms: readonly [number, number]
  /** The city's bounds: west, south, east, north */
  extent: readonly [number, number, number, number]
  /** Called once the tiles of the area in view are loaded */
  onViewportLoad?: () => void
  /** At street level, its opacity and its rings */
  overview?: OverviewStyle
}) {
  const palette = [
    colors.result0,
    colors.result1,
    colors.result2,
    colors.result3,
  ] as const

  return new TileLayer<ImageBitmap | null>({
    id: `grid-${slug}`,
    data: tileUrlTemplate({ kind: "grid", slug }, release),
    tileSize: 512,
    minZoom: zooms[0],
    maxZoom: zooms[1],
    // Below the grid's first zoom, its first tiles, enlarged
    extent: [...extent],
    getTileData: gridTile,
    onViewportLoad,
    onTileUnload: (tile) => tile.content?.close(),
    opacity: overview?.opacity ?? 1,
    visible: overview?.visible ?? true,
    // The colour scheme, which draws the tiles again in its colours
    updateTriggers: {
      renderSubLayers: [palette.map(String).join(), overview?.revealSpacing],
    },
    renderSubLayers: (props) => {
      if (!props.data) {
        return null
      }
      const { west, south, east, north } = props.tile.bbox as {
        west: number
        south: number
        east: number
        north: number
      }
      return new BitmapLayer<GridPaletteProps>({
        ...props,
        ...overview,
        opacity: props.opacity,
        visible: props.visible,
        data: undefined,
        image: props.data,
        bounds: [west, south, east, north],
        textureParameters: {
          minFilter: "nearest",
          magFilter: "nearest",
          mipmapFilter: "none",
        },
        extensions: [gridPalette, ...(overview?.extensions ?? [])],
        gridPalette: palette,
      })
    },
  })
}
