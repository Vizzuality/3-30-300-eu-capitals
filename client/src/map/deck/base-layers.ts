import { GeoJsonLayer } from "@deck.gl/layers"

import type { CityOutline } from "@/data/schemas"
import type { MapColors } from "@/map/map-colors"
import {
  capitalRingLayer,
  capitalsLayers,
  type CapitalLayersInput,
  type CapitalRing,
} from "./capital-layers"
import { europeLayer } from "./europe-layer"

/*
 * What the map draws: on Home, the muted map of Europe and the 27 capitals
 * over it; on a capital's page, its city limits (until the city maps
 * arrive), so the camera's moves can be followed. Every colour comes from
 * the design tokens.
 */

export type BaseLayersInput = {
  colors: MapColors
  /** The data release, whose tiles are drawn */
  release: string
  /** The city limits of the capital shown, on its page */
  city: CityOutline | undefined
  /** The capitals, on Home, over the map of Europe */
  capitals: Omit<CapitalLayersInput, "colors"> | undefined
  /** The ring of a capital just clicked */
  ring: CapitalRing | undefined
}

export function baseLayers({
  colors,
  release,
  city,
  capitals,
  ring,
}: BaseLayersInput) {
  return [
    // Europe drawn on Home only; kept, hidden, on a capital's page, so
    // coming back to Home finds its tiles ready
    europeLayer({ colors, release, visible: capitals !== undefined }),
    ...(capitals ? capitalsLayers({ ...capitals, colors }) : []),
    // The city limits, as the release writes them (until the city maps
    // arrive)
    city &&
      new GeoJsonLayer({
        id: `city-${city.slug}`,
        data: city as never,
        getFillColor: colors.land,
        getLineColor: colors.ink2,
        getLineWidth: 1,
        lineWidthUnits: "pixels",
        lineJointRounded: true,
      }),
    ring && capitalRingLayer(ring, colors),
  ]
}
