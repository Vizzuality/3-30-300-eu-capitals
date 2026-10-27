import type { CapitalTileArchive } from "@/data/api"
import { standInRelease, type Summary } from "@/data/schemas"
import type { CapitalSlug } from "@/lib/capitals"

/*
 * Which of a capital's archives of tiles its map asks for, so the map never
 * asks for tiles the release does not have. A capital with placeholder
 * figures has no tiles at all: its outline and figures are made up. The
 * stand-in release, the development and test data, keeps the real capitals'
 * grids and overview water, and of their city maps only a corner of
 * Stockholm (central Södermalm): the whole map is too large to keep with
 * the tests.
 */

/**
 * The corner of Stockholm's city map the stand-in keeps: the zoom-14 tiles
 * x 9014–9015, y 4819 (central and eastern Södermalm), and every tile under
 * them to zoom 16
 */
export const standInCityTiles = {
  slug: "stockholm",
  z: 14,
  x: [9014, 9015],
  y: [4819, 4819],
  maxZoom: 16,
} as const satisfies {
  slug: CapitalSlug
  z: number
  x: readonly [number, number]
  y: readonly [number, number]
  maxZoom: number
}

/** A tile corner's longitude and latitude */
function tileCorner(z: number, x: number, y: number): [number, number] {
  const n = 2 ** z
  return [
    (x / n) * 360 - 180,
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI,
  ]
}

type Bounds = [west: number, south: number, east: number, north: number]

/** The stand-in's corner of Stockholm: west, south, east, north */
export function standInCityArea(): Bounds {
  const { z, x, y } = standInCityTiles
  const [west, north] = tileCorner(z, x[0], y[0])
  const [east, south] = tileCorner(z, x[1] + 1, y[1] + 1)
  return [west, south, east, north]
}

/** How far the city map reaches beyond the city, in metres */
const cityBand = 1000

/** Web Mercator's sphere, in metres */
const EARTH_RADIUS = 6_378_137

type CapitalSummary = Pick<Summary, "placeholder"> & {
  slug?: CapitalSlug
  bbox?: Summary["bbox"]
}

const standInCity = (summary: CapitalSummary, release: string) =>
  release === standInRelease && summary.slug === standInCityTiles.slug

export function capitalArchives(
  summary: CapitalSummary,
  release: string
): Record<CapitalTileArchive, boolean> {
  const real = summary.placeholder !== true
  return {
    grid: real,
    context: real,
    city: real && (release !== standInRelease || standInCity(summary, release)),
  }
}

/**
 * Where the capital's city map has tiles: the city and its 1 km band (the
 * city's bounds widened by a kilometre), or in the stand-in release, its
 * corner of Stockholm
 */
export function cityTileArea(
  summary: CapitalSummary,
  release: string
): Bounds | undefined {
  if (!capitalArchives(summary, release).city || !summary.bbox) {
    return undefined
  }
  if (standInCity(summary, release)) {
    return standInCityArea()
  }
  const [west, south, east, north] = summary.bbox
  const latitude = (((south + north) / 2) * Math.PI) / 180
  const degrees = (cityBand / EARTH_RADIUS) * (180 / Math.PI)
  const across = degrees / Math.cos(latitude)
  return [west - across, south - degrees, east + across, north + degrees]
}
