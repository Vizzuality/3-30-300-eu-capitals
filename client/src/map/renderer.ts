import type { CapitalTileArchive } from "@/data/api"
import type { CityOutline, Summary } from "@/data/schemas"
import type { CapitalSlug } from "@/lib/capitals"
import type { StreetBuilding } from "@/lib/street-buildings"
import type { HomeCapital, LngLat } from "./home-capitals"
import type { MapCamera } from "./map-camera"
import type { MapColors } from "./map-colors"

/*
 * What draws the map: deck.gl in the site, loaded only with the map, or a
 * stand-in without WebGL in the accessibility tests. Both carry out the
 * camera's moves and report what they draw; the map's focus stop, its keys
 * and its overlays around them are the same.
 */

/**
 * A press on the map, which sends out a ring: a capital (clicked, tapped,
 * or Enter in keyboard focus), which also wobbles, or a place of the city
 * overview zoomed into
 */
export type MapPress = {
  /** A new press has a new id */
  id: number
  /** The capital pressed, on Home */
  slug?: CapitalSlug
  /** Where it was pressed (the middle of the capital or of the map, with the keyboard) */
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

/** A capital's map, on its page */
export type CapitalMap = {
  slug: CapitalSlug
  /** The city's bounds and the zooms of its tiles, from its summary */
  bbox: Summary["bbox"]
  zooms: Summary["zooms"]
  /** The overview's rectangle */
  context: Summary["context"]
  /** The city's area, in km² */
  areaKm2: number
  /** Which of its archives of tiles the map draws from */
  archives: Record<CapitalTileArchive, boolean>
  /**
   * Where its city map has tiles (west, south, east, north), if the release
   * has them
   */
  cityArea: [number, number, number, number] | undefined
  /** Every character of its street names, for their font */
  labelChars: string
  /** On the city overview, a click or a tap zooms in there */
  onPress: ((at: LngLat) => void) | undefined
}

/** The street level of a capital's map, and what the visitor does there */
export type StreetMap = {
  /** The building in keyboard focus, which lifts with a focus ring */
  focused: number | undefined
  /** A building with results clicked or tapped */
  onPress: (id: number) => void
  /** The buildings with results in view, as their tiles load */
  onBuildings: (buildings: ReadonlyArray<StreetBuilding>) => void
}

export type MapRendererProps = {
  camera: MapCamera
  colors: MapColors
  /** The data release, whose tiles are drawn */
  release: string
  /** The capitals, on Home */
  home: HomeMap | undefined
  /**
   * The last press, which sends out a ring; a capital pressed also wobbles,
   * even as its page opens
   */
  press: MapPress | undefined
  /** The city limits of the capital shown, on its page, once loaded */
  city: CityOutline | undefined
  /** The capital shown, on its page, once its summary is loaded */
  capital: CapitalMap | undefined
  /** At street level */
  street: StreetMap | undefined
  /** On the phone's map band, one finger scrolls the page */
  oneFingerScrolls: boolean
  /** Whether the map is on screen; a hidden map draws nothing */
  visible: boolean
}
