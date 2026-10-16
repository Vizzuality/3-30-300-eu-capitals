import type { CityOutline } from "@/data/schemas"
import type { CapitalSlug } from "@/lib/capitals"
import type { HomeCapital, LngLat } from "./home-capitals"
import type { MapCamera } from "./map-camera"
import type { MapColors } from "./map-colors"

/*
 * What draws the map: deck.gl in the site, loaded only with the map, or a
 * stand-in without WebGL in the accessibility tests. Both carry out the
 * camera's moves and report what they draw; the map's focus stop, its keys
 * and its overlays around them are the same.
 */

/** A capital pressed (clicked, tapped, or Enter in keyboard focus) */
export type CapitalPress = {
  /** A new press has a new id */
  id: number
  slug: CapitalSlug
  /** Where it was pressed (its middle, with the keyboard) */
  at: LngLat
}

/** The capitals of the Home map, and what the visitor does with them */
export type HomeMap = {
  capitals: ReadonlyArray<HomeCapital>
  /** The capital that rises: under the pointer, in focus, or its row's */
  lifted: CapitalSlug | undefined
  /** The capital in keyboard focus */
  focused: CapitalSlug | undefined
  /** The capital under the pointer, as it changes */
  onHover: (slug: CapitalSlug | undefined) => void
  /** A capital clicked or tapped, and where */
  onPress: (slug: CapitalSlug, at: LngLat) => void
}

export type MapRendererProps = {
  camera: MapCamera
  colors: MapColors
  /** The data release, whose tiles are drawn */
  release: string
  /** The capitals, on Home */
  home: HomeMap | undefined
  /**
   * The last capital pressed, which wobbles and sends out a ring, even as
   * its page opens
   */
  press: CapitalPress | undefined
  /** The city limits of the capital shown, on its page, once loaded */
  city: CityOutline | undefined
  /** On the phone's map band, one finger scrolls the page */
  oneFingerScrolls: boolean
  /** Whether the map is on screen; a hidden map draws nothing */
  visible: boolean
}
