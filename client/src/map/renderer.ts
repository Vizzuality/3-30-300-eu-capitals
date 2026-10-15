import type { Capital } from "@/data/schemas"
import type { MapCamera } from "./map-camera"
import type { MapColors } from "./map-colors"

/*
 * What draws the map: deck.gl in the site, loaded only with the map, or a
 * stand-in without WebGL in the accessibility tests. Both carry out the
 * camera's moves and report what they draw; the map's focus stop, its keys
 * and its overlays around them are the same.
 */
export type MapRendererProps = {
  camera: MapCamera
  colors: MapColors
  /** The capital shown, on its page */
  city: Pick<Capital, "slug" | "centre" | "outline"> | undefined
  /** On the phone's map band, one finger scrolls the page */
  oneFingerScrolls: boolean
  /** Whether the map is on screen; a hidden map draws nothing */
  visible: boolean
}
