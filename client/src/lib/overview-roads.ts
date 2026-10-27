import { streetLevelWidth } from "@/lib/visible-area"
import type { RoadClass } from "@/map/deck/context-tile-decode"

/*
 * The main roads on a capital's city overview: their widths, and how they
 * fade out as the street level nears.
 *
 * A road is as wide on the ground as it is in the city, by class, wider for
 * a dual carriageway (two roads a few metres apart, drawn as one), and
 * never thinner on screen than a pixel width of its class, so the roads
 * stay readable when the overview shows the whole city. Its casing reaches
 * a little beyond it on each side.
 *
 * Over the last zoom levels before the street level (`roadFadeLevels`), the
 * roads fade out, so they are gone when the street level, with its own
 * streets, takes over. The fade follows the zoom, not time.
 */

/**
 * Each class's width on the ground, in metres, for one carriageway and a
 * dual one, and its narrowest on screen, in CSS pixels
 */
const roadWidths: Record<
  RoadClass,
  { single: number; dual: number; pixels: number }
> = {
  motorway: { single: 12, dual: 28, pixels: 2 },
  trunk: { single: 10, dual: 24, pixels: 1.7 },
  primary: { single: 9, dual: 20, pixels: 1.3 },
  secondary: { single: 8, dual: 16, pixels: 0.9 },
  tertiary: { single: 7, dual: 13, pixels: 0.75 },
}

/** How far the casing reaches beyond the road on each side, on the ground */
const casingMetres = 1
/** How far the casing reaches beyond the road on each side, at the narrowest */
const casingPixels = 0.6

/**
 * A road's width on the ground in metres, and its narrowest on screen in
 * CSS pixels, or its casing's
 */
export function roadWidth(
  roadClass: RoadClass,
  { dual, casing }: { dual: boolean; casing: boolean }
) {
  const widths = roadWidths[roadClass]
  return {
    metres:
      (dual ? widths.dual : widths.single) + (casing ? 2 * casingMetres : 0),
    minPixels: widths.pixels + (casing ? 2 * casingPixels : 0),
  }
}

/** The zoom levels over which the roads fade out before the street level */
export const roadFadeLevels = 1

/**
 * The roads' opacity for an area in view `viewWidth` metres wide: 1 from
 * `roadFadeLevels` zoom levels before the street level, down to 0 at the
 * street level, in step with the zoom (each level halves the width)
 */
export function roadFade(viewWidth: number) {
  if (!(viewWidth > 0)) {
    return 1
  }
  const levels = Math.log2(viewWidth / streetLevelWidth) / roadFadeLevels
  return Math.max(0, Math.min(1, levels))
}
