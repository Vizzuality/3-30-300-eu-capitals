import type { MapView } from "@/lib/guide"

/*
 * The area of the map in view, as the address keeps it (`at`): its west,
 * south, east and north edges in degrees, `17.9906,59.3105,18.0102,59.3201`.
 * The map writes it once the camera settles, and fits it to the screen when
 * a link opens, so a shared link shows the same area on a phone and on a
 * desktop.
 *
 * Which view the capital's map shows follows from it: the city overview,
 * and the street once the area in view is narrower than about 1.5 km.
 */

export type VisibleArea = {
  west: number
  south: number
  east: number
  north: number
}

/** Web Mercator's sphere, in metres */
const EARTH_RADIUS = 6_378_137

/**
 * The widest area in view at street level, in metres. A wider area shows
 * the city overview.
 */
export const streetLevelWidth = 1500

/** The edges of the area written in the address, or undefined if invalid */
export function parseVisibleArea(at: string): VisibleArea | undefined {
  const parts = at.split(",")
  if (parts.length !== 4 || parts.some((part) => part.trim() === "")) {
    return undefined
  }
  const [west, south, east, north] = parts.map(Number)
  const valid =
    [west, south, east, north].every(Number.isFinite) &&
    west >= -180 &&
    east <= 180 &&
    west < east &&
    south >= -90 &&
    north <= 90 &&
    south < north
  return valid ? { west, south, east, north } : undefined
}

/** How wide the area is on the ground, in metres, at its middle latitude */
export function groundWidth({ west, south, east, north }: VisibleArea) {
  const latitude = (((south + north) / 2) * Math.PI) / 180
  return (((east - west) * Math.PI) / 180) * EARTH_RADIUS * Math.cos(latitude)
}

/**
 * The view of the capital's map for the area in view: the city overview as
 * the capital opens (no area yet) and while zoomed out, the street once
 * zoomed in
 */
export function mapViewOf(area: VisibleArea | undefined): MapView {
  return area && groundWidth(area) < streetLevelWidth ? "street" : "overview"
}
