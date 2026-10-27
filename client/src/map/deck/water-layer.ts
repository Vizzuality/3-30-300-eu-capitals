import type { Layer } from "@deck.gl/core"
import { PathLayer } from "@deck.gl/layers"

import { tileUrlTemplate } from "@/data/api"
import type { CapitalSlug } from "@/lib/capitals"
import { roadWidth } from "@/lib/overview-roads"
import { withOpacity, type MapColors, type Rgba } from "@/map/map-colors"
import {
  roadClasses,
  type ContextTileContent,
  type RoadClass,
  type RoadPaths,
} from "./context-tile-decode"
import { ContextTileLayer } from "./context-tile-layer"
import type { OverviewStyle } from "./reveal-extension"
import { commonPerMetre, sub, type SubLayerProps } from "./street-layers"

/*
 * The city overview's map around the grid, from the capital's context
 * tiles, over the whole overview's rectangle:
 * - the water: the sea, lakes and rivers, inside the city or not, all in
 *   the Water colour; outside the city and its 1 km band, water too narrow
 *   to see at the overview's zooms is left out of the tiles. Drawn over the
 *   grid, so shores inside the city stay sharp where the 10 m squares would
 *   blur them;
 * - the main roads, to find one's way: lines in the Street colour with a
 *   casing in the Shadow colour, fainter by class, tunnels faint and
 *   without casing. Below zoom 10 the tiles hold the motorways, trunk and
 *   primary roads only. Drawn over the water, under the city's limit line,
 *   the casings of every tile first, then the roads.
 *
 * The roads are paths with round joints and caps, as wide as on the ground
 * by class and never thinner than a pixel width of their class (one path
 * layer for each class, as the narrowest width is the layer's own). They
 * fade out as the street level nears, `fade` being their opacity.
 */

type ContextInput = {
  slug: CapitalSlug
  release: string
  colors: MapColors
  /** The zooms of the capital's context tiles */
  zooms: readonly [number, number]
  /** The overview's rectangle: west, south, east, north */
  extent: readonly [number, number, number, number]
  /** At street level, its opacity and its rings */
  overview?: OverviewStyle
}

/** Each class's opacity, and its casing's strength */
const roadStyles: Record<RoadClass, { opacity: number; casing: number }> = {
  motorway: { opacity: 1, casing: 1 },
  trunk: { opacity: 1, casing: 1 },
  primary: { opacity: 1, casing: 1 },
  secondary: { opacity: 0.85, casing: 0.5 },
  tertiary: { opacity: 0.8, casing: 0.4 },
}
/** Tunnels: faint, with no casing */
const tunnelOpacity = 0.45

function contextGroup(
  input: ContextInput,
  id: string,
  render: (
    props: SubLayerProps,
    content: ContextTileContent
  ) => Array<Layer | null>,
  extra: Record<string, unknown> = {}
) {
  const scheme = input.colors.street.join()
  return new ContextTileLayer({
    ...input.overview,
    id: `${id}-${input.slug}`,
    data: tileUrlTemplate({ kind: "context", slug: input.slug }, input.release),
    minZoom: input.zooms[0],
    maxZoom: input.zooms[1],
    extent: [...input.extent],
    // The colour scheme, which draws the tiles again in its colours
    updateTriggers: { renderSubLayers: [scheme, input.colors.water.join()] },
    renderSubLayers: (props: unknown) => {
      const subProps = props as SubLayerProps
      const content = subProps.data as unknown as ContextTileContent | null
      return content ? render(subProps, content) : null
    },
    ...extra,
  } as never)
}

export function waterLayer(
  input: ContextInput & {
    /** Called with the tiles in view once they are loaded */
    onTilesLoaded?: (tiles: Array<ContextTileContent>) => void
  }
) {
  return contextGroup(
    input,
    "water",
    (props, content) => [
      sub(props, "water", content.layers.water, {
        stroked: false,
        getFillColor: input.colors.water,
        updateTriggers: { getFillColor: input.colors.water.join() },
      }),
    ],
    {
      onViewportLoad: (loaded: Array<{ content: ContextTileContent | null }>) =>
        input.onTilesLoaded?.(
          loaded.flatMap(({ content }) => (content ? [content] : []))
        ),
    }
  )
}

/**
 * The roads of a class in a tile, or their casings, as paths (deck.gl's
 * `PathLayer`), placed as `MVTLayer` places a tile's layers, its clip
 * extension kept
 */
function roadPathsLayer(
  props: SubLayerProps,
  roadClass: RoadClass,
  roads: RoadPaths,
  colors: MapColors,
  casing: boolean,
  unit: number
) {
  if (roads.length === 0) {
    return null
  }
  const { data: _data, tile: _tile, id, ...rest } = props
  const style = roadStyles[roadClass]
  const single = roadWidth(roadClass, { dual: false, casing })
  const dual = roadWidth(roadClass, { dual: true, casing })
  const color: Rgba = casing
    ? withOpacity(colors.shadow, (colors.shadow[3] / 255) * style.casing)
    : withOpacity(colors.street, style.opacity)
  const tunnelColor: Rgba = casing
    ? [0, 0, 0, 0]
    : withOpacity(colors.street, tunnelOpacity)
  return new PathLayer<unknown>({
    ...(rest as Record<string, unknown>),
    id: `${id}-${roadClass}`,
    data: {
      length: roads.length,
      startIndices: roads.startIndices,
      attributes: { getPath: { value: roads.positions, size: 2 } },
    } as never,
    // Each path as it is: open (a loop's ends meet under round caps)
    _pathType: "open",
    positionFormat: "XY",
    getWidth: (_: unknown, { index }: { index: number }) =>
      (roads.dual[index] === 1 ? dual : single).metres * unit,
    widthUnits: "common",
    widthMinPixels: single.minPixels,
    jointRounded: true,
    capRounded: true,
    getColor: (_: unknown, { index }: { index: number }) =>
      roads.tunnel[index] === 1 ? tunnelColor : color,
    pickable: false,
    updateTriggers: {
      getColor: `${colors.street.join()}|${colors.shadow.join()}`,
    },
  } as never)
}

/**
 * The roads' casings, then the roads, each a group of its own, at `fade`
 * times the overview's opacity
 */
export function roadLayers(input: ContextInput & { fade: number }) {
  const { colors, extent, fade, overview } = input
  // Widths in metres, in common units at the overview's middle latitude
  const unit = commonPerMetre((extent[1] + extent[3]) / 2)
  const faded = {
    opacity: (overview?.opacity ?? 1) * fade,
    visible: (overview?.visible ?? true) && fade > 0,
  }
  const group = (id: string, casing: boolean) =>
    contextGroup(
      input,
      id,
      (props, content) =>
        roadClasses.map((roadClass, index) =>
          roadPathsLayer(
            props,
            roadClass,
            content.roads[index],
            colors,
            casing,
            unit
          )
        ),
      faded
    )
  return [group("road-casings", true), group("roads", false)]
}
