import { GeoJsonLayer } from "@deck.gl/layers"

import { tileUrlTemplate } from "@/data/api"
import { withOpacity, type MapColors, type Rgba } from "@/map/map-colors"
import { LocalMVTLayer } from "./local-mvt-layer"

/*
 * The muted map of Europe under the capitals, from the release's Home map
 * tiles (`europe.pmtiles`, zooms 0–7, enlarged beyond): the sea hatched like
 * the city water, with two ripples along the coast and a faint grid of
 * latitude and longitude; the EU countries in three near-identical paper
 * tints, the others a shade quieter, with soft borders and the coast line
 * over them. Every colour comes from the design tokens, so the map follows
 * the colour scheme; line widths are in pixels, as in the mockup.
 */

/** A feature of a Home map tile, with the layer it comes from */
type EuropeFeature = {
  type: "Feature"
  geometry: { type: string }
  properties: {
    layerName: string
    // `coastline`: 0 the coast, 1 and 2 the ripples out to sea
    kind?: number
    // `countries`: 1 for an EU country, then one of its three tints
    eu?: number
    tint?: number
  }
}

/** The area the tiles cover: west, south, east, north */
const europeExtent = [-32, 24, 50, 73]

/** Whether a feature is drawn under the land (the sea and its lines) */
const isUnderLand = ({ properties: { layerName, kind } }: EuropeFeature) =>
  layerName === "sea" ||
  layerName === "sea_marks" ||
  layerName === "graticule" ||
  (layerName === "coastline" && kind !== 0)

// Within each group, polygons first, then the lines over them, in this order
const drawOrder = ["sea", "countries", "sea_marks", "graticule"]
const orderOf = ({ properties: { layerName, kind } }: EuropeFeature) =>
  layerName === "coastline"
    ? drawOrder.length + (kind === 0 ? 2 : 1)
    : layerName === "borders"
      ? drawOrder.length
      : drawOrder.indexOf(layerName)

/** The look of every line, by layer, from the mockup */
function lineStyle(
  { properties: { layerName, kind } }: EuropeFeature,
  colors: MapColors
): { color: Rgba; width: number } {
  switch (layerName) {
    case "sea_marks":
      return { color: withOpacity(colors.waterLines, 0.38), width: 0.9 }
    case "graticule":
      return { color: withOpacity(colors.ink, 0.07), width: 0.8 }
    case "borders":
      return { color: colors.surface, width: 1.1 }
    case "coastline":
      // The coast, then the ripple 14 km out, then the fainter one 32 km out
      return kind === 0
        ? { color: withOpacity(colors.waterLines, 0.8), width: 0.9 }
        : {
            color: withOpacity(colors.waterLines, kind === 1 ? 0.55 : 0.28),
            width: 0.8,
          }
    default:
      return { color: [0, 0, 0, 0], width: 0 }
  }
}

function fillColor(
  { properties: { layerName, eu, tint } }: EuropeFeature,
  colors: MapColors
): Rgba {
  if (layerName === "sea") {
    return colors.europeSea
  }
  if (eu !== 1) {
    return colors.europeOther
  }
  const tints = [colors.europeLand1, colors.europeLand2, colors.europeLand3]
  return tints[tint ?? 0] ?? tints[0]
}

export function europeLayer({
  colors,
  release,
  visible,
  opacity = 1,
}: {
  colors: MapColors
  release: string
  /** Whether it is drawn; hidden, it keeps the tiles it has */
  visible: boolean
  /** As it fades out, or back in, with the capitals */
  opacity?: number
}) {
  // The colour scheme, which redraws the tiles' layers when it changes
  const scheme = colors.europeSea.join()

  return new LocalMVTLayer({
    id: "europe",
    data: tileUrlTemplate({ kind: "europe" }, release),
    minZoom: 0,
    maxZoom: 7,
    extent: europeExtent,
    // Features as objects, so each tile can be drawn in two layers, under
    // and over the land (the tiles are small, 32 kB at most), decoded by the
    // site's own worker.
    binary: false,
    visible,
    opacity,
    updateTriggers: { renderSubLayers: scheme },
    renderSubLayers: (props) => {
      const features = [
        ...((props.data ?? []) as unknown as Array<EuropeFeature>),
      ]
      features.sort((a, b) => orderOf(a) - orderOf(b))
      const style = {
        filled: true,
        stroked: false,
        getFillColor: (feature: EuropeFeature) => fillColor(feature, colors),
        getLineColor: (feature: EuropeFeature) =>
          lineStyle(feature, colors).color,
        getLineWidth: (feature: EuropeFeature) =>
          lineStyle(feature, colors).width,
        lineWidthUnits: "pixels" as const,
        lineJointRounded: true,
        lineCapRounded: true,
        updateTriggers: { getFillColor: scheme, getLineColor: scheme },
      }
      return [
        new GeoJsonLayer<EuropeFeature["properties"]>({
          ...props,
          ...style,
          id: `${props.id}-under-land`,
          data: features.filter(isUnderLand) as never,
        }),
        new GeoJsonLayer<EuropeFeature["properties"]>({
          ...props,
          ...style,
          id: `${props.id}-land`,
          data: features.filter((feature) => !isUnderLand(feature)) as never,
        }),
      ]
    },
  })
}
