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
 */

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
}: BaseLayersInput) {
  const shown = capital && city?.slug === capital.slug ? capital : undefined
  return [
    // Europe drawn on Home only; kept, hidden, on a capital's page, so
    // coming back to Home finds its tiles ready
    europeLayer({ colors, release, visible: capitals !== undefined }),
    ...(capitals ? capitalsLayers({ ...capitals, colors }) : []),
    city &&
      cityGroundLayer(
        city,
        shown?.archives.grid && gridDrawn ? colors.water : colors.land
      ),
    capital?.archives.grid &&
      gridLayer({
        slug: capital.slug,
        release,
        colors,
        zooms: capital.zooms.grid,
        extent: capital.bbox,
        onViewportLoad: onGridDrawn,
      }),
    capital?.archives.context &&
      waterLayer({
        slug: capital.slug,
        release,
        colors,
        zooms: capital.zooms.context,
        extent: capital.context.bbox,
      }),
    // Outside the city, over the water: its shadow and soft rings, then its
    // limit line
    ...(city
      ? cityEdgeLayers({
          city,
          colors,
          size: shown && Math.sqrt(shown.areaKm2) * 1000,
          metresPerPixel,
        })
      : []),
    city && cityLimitsLayer(city, colors),
    ring && pressRingLayer(ring, colors),
  ]
}
