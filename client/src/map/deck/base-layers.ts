import type { Layer } from "@deck.gl/core"

import type { CityOutline } from "@/data/schemas"
import type { MapColors } from "@/map/map-colors"
import type { CapitalMap } from "@/map/renderer"
import {
  capitalsLayers,
  pressRingLayer,
  type CapitalLayersInput,
  type PressRing,
} from "./capital-layers"
import { cityEdgeLayers, cityGroundLayer, cityLimitsLayer } from "./city-layers"
import { europeLayer } from "./europe-layer"
import { gridLayer } from "./grid-layer"
import type { RevealClock } from "./reveal-extension"
import { arrivalRings, revealOverview } from "./street-layers"
import { waterLayer } from "./water-layer"

/*
 * What the map draws: on Home, the muted map of Europe and the 27 capitals
 * over it; on a capital's page, the city overview, the city on a complete
 * map: the land around it in the paper's colour, the city's ground, its
 * 10 m grid coloured by the rules met, every water of the map in the Water
 * colour over it, then the city's edge (its shadow and soft rings outside
 * it, and its limit line). Inside the city, the grid leaves only its water
 * uncoloured, so once the grid is drawn the city's ground is the Water
 * colour: water the grid sees, where the drawn shore runs between two
 * squares, never shows as land. Every colour comes from the design tokens.
 *
 * At street level the street is drawn under the overview, which gives way
 * to it in rings around where the visitor zoomed in, or fades out, and
 * fades back over it on the way out; the street names come over all.
 */

/** The street level, under the overview */
export type StreetInput = {
  layers: Array<Layer | null>
  /** The overview's opacity over the street */
  overview: number
}

export type BaseLayersInput = {
  colors: MapColors
  /** The data release, whose tiles are drawn */
  release: string
  /** The city limits of the capital shown, on its page */
  city: CityOutline | undefined
  /** The capital shown, on its page */
  capital: CapitalMap | undefined
  /** The capitals, on Home, over the map of Europe */
  capitals: Omit<CapitalLayersInput, "colors"> | undefined
  /** Whether the capital's grid has drawn the area in view */
  gridDrawn: boolean
  /** Metres on the ground per CSS pixel, for the rings around the city */
  metresPerPixel: number | undefined
  /** Called once the grid has drawn the area in view */
  onGridDrawn: () => void
  /** The ring of a press: a capital, or a place zoomed into */
  ring: PressRing | undefined
  /** At street level, and while the overview fades back over it */
  street?: StreetInput
  /** The arrival at street level, which the overview gives way to */
  reveal: RevealClock
  /** How far apart the arrival's waves are, in pixels */
  waveSpacing: number
  /** The street names, over everything */
  streetNames?: Layer | null
}

export function baseLayers({
  colors,
  release,
  city,
  capital,
  capitals,
  gridDrawn,
  metresPerPixel,
  onGridDrawn,
  ring,
  street,
  reveal,
  waveSpacing,
  streetNames,
}: BaseLayersInput) {
  const shown = capital && city?.slug === capital.slug ? capital : undefined
  // The overview over the street: faded, or giving way in rings
  const overview = {
    opacity: street?.overview ?? 1,
    visible: (street?.overview ?? 1) > 0,
    extensions: [revealOverview],
    ...arrivalRings(reveal, waveSpacing),
    revealDirection: -1,
  }
  return [
    // Europe drawn on Home only; kept, hidden, on a capital's page, so
    // coming back to Home finds its tiles ready
    europeLayer({ colors, release, visible: capitals !== undefined }),
    ...(capitals ? capitalsLayers({ ...capitals, colors }) : []),
    city &&
      cityGroundLayer(
        city,
        shown?.archives.grid && gridDrawn ? colors.water : colors.land,
        overview.visible
      ),
    ...(street?.layers ?? []),
    capital?.archives.grid &&
      gridLayer({
        slug: capital.slug,
        release,
        colors,
        zooms: capital.zooms.grid,
        extent: capital.bbox,
        onViewportLoad: onGridDrawn,
        overview,
      }),
    capital?.archives.context &&
      waterLayer({
        slug: capital.slug,
        release,
        colors,
        zooms: capital.zooms.context,
        extent: capital.context.bbox,
        overview,
      }),
    // Outside the city, over the water: its shadow and soft rings, then its
    // limit line
    ...(city
      ? cityEdgeLayers({
          city,
          colors,
          size: shown && Math.sqrt(shown.areaKm2) * 1000,
          metresPerPixel,
          overview,
        })
      : []),
    city && cityLimitsLayer(city, colors, overview),
    streetNames ?? null,
    ring && pressRingLayer(ring, colors),
  ]
}
