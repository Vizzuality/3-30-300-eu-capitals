import { GeoJsonLayer, PathLayer, SolidPolygonLayer } from "@deck.gl/layers"

import type { CityOutline } from "@/data/schemas"
import { linePart } from "@/lib/building-evidence"
import { withOpacity, type MapColors, type Rgba } from "@/map/map-colors"
import { simplifyRing } from "@/map/simplify"
import type { OverviewStyle } from "./reveal-extension"
import { screenOffset, type ScreenOffsetProps } from "./screen-offset-extension"
import type { CityShow } from "./view-motion"

/*
 * The city on its overview, as the reference draws it: its ground under the
 * grid, and its edge, all along its limits, coasts and islands included:
 * outside the city only, over whatever lies there (the paper or the water),
 * a short shadow and two soft rings at a constant distance from the limits,
 * and over everything the limit line. Holes in the city (Frederiksberg in
 * Copenhagen, the Vatican in Rome) are outside the city: no ground and no
 * grid, with the edge along them as along the outer limits.
 *
 * As the city arrives, each part comes in on its own (`CityShow`): the limit
 * line drawing itself, along its simplified rings, before the whole line
 * takes its place.
 */

/**
 * The rings around the city, at a share of the city's size (the square root
 * of its area) from its limits: a 1 px line in Ink, the outer one half as
 * strong
 */
const rings = [
  { distance: 0.018, opacity: 0.18 },
  { distance: 0.04, opacity: 0.09 },
] as const
const ringWidth = 1
/** The shadow under the city, in pixels, x right and y down */
const shadowOffset = [1.5, 3] as const
/** The limit line: Ink at 55%, 1.1 px */
const limitOpacity = 0.55
const limitWidth = 1.1

type Ring = Array<[number, number]>
type Polygon = Array<Ring>

// Every ring of the limits (exteriors and holes), made once per outline
const ringsOf = new WeakMap<CityOutline, Array<Ring>>()
function outlineRings(city: CityOutline) {
  let found = ringsOf.get(city)
  if (!found) {
    found = city.geometry.coordinates.flat() as Array<Ring>
    ringsOf.set(city, found)
  }
  return found
}

/**
 * The city's size a ring's line follows its limits within: as the reference
 * simplifies its soft rings
 */
const ringTolerance = 1 / 400

// The rings of the limits simplified for the soft rings, made once per
// outline: a band as wide as theirs, drawn at every point of a detailed
// coast, would be drawn over itself thousands of times
const simplifiedOf = new WeakMap<CityOutline, Array<Ring>>()
function softRings(city: CityOutline, size: number) {
  let found = simplifiedOf.get(city)
  if (!found) {
    found = outlineRings(city).map((ring) =>
      simplifyRing(ring, size * ringTolerance)
    )
    simplifiedOf.set(city, found)
  }
  return found
}

/*
 * What lies outside the city is told apart with the depth buffer, which the
 * map otherwise leaves unused (it is flat: every layer is drawn in its
 * order, with `depthCompare: "always"`). A mask is drawn invisibly, nearer
 * than the map (a depth bias); the shadow and the rings are then drawn only
 * where no mask lies in front of them. deck.gl has no layer that offsets a
 * line by a distance on the ground, and no mask outside its extensions
 * package; so a ring is the outer edge of a band of the limits, whose inner
 * part, a band one line narrower, is masked first.
 */
const invisible: Rgba = [0, 0, 0, 0]
const masking = {
  // With a depth test, or no depth would be written
  parameters: { depthWriteEnabled: true, depthCompare: "less-equal" as const },
  getPolygonOffset: () => [0, -100_000] as [number, number],
}
const masked = {
  parameters: { depthWriteEnabled: false, depthCompare: "less" as const },
  getPolygonOffset: () => [0, 0] as [number, number],
}

/**
 * A band of the limits' lines, `width` metres wide, rounded at its joins:
 * its sides lie `width / 2` from the limits, on both sides
 */
function band(id: string, paths: Array<Ring>, width: number, color: Rgba) {
  return {
    id,
    data: paths,
    getPath: (ring: Ring) => ring,
    getColor: color,
    getWidth: width,
    widthUnits: "meters" as const,
    jointRounded: true,
    capRounded: true,
  }
}

/** Under the grid: the city's ground (hidden under the street) */
export function cityGroundLayer(
  city: CityOutline,
  ground: Rgba,
  visible = true,
  opacity = 1
) {
  return new GeoJsonLayer({
    id: `city-${city.slug}`,
    data: city as never,
    getFillColor: ground,
    stroked: false,
    visible: visible && opacity > 0,
    opacity,
    updateTriggers: { getFillColor: ground.join() },
  })
}

/**
 * Over the water, outside the city: the shadow and the rings.
 * `metresPerPixel` sets the rings' line width on the ground.
 */
export function cityEdgeLayers({
  city,
  colors,
  size,
  metresPerPixel,
  overview,
  show,
}: {
  city: CityOutline
  colors: MapColors
  /** The square root of the city's area, in metres; none, no rings */
  size: number | undefined
  metresPerPixel: number | undefined
  /** At street level, its opacity and its rings */
  overview?: OverviewStyle
  /** As the city arrives */
  show?: CityShow
}) {
  const visible = overview?.visible ?? true
  const shownOpacity = overview?.opacity ?? 1
  const ringsShown = show?.rings ?? 1
  const shadow = show?.shadow ?? 1
  const shadowOut = show?.shadowOut ?? 1
  const polygons = city.geometry.coordinates as Array<Polygon>
  const line = metresPerPixel === undefined ? 0 : ringWidth * metresPerPixel
  const ringLayers =
    size === undefined || line === 0
      ? []
      : rings.flatMap(({ distance, opacity }, index) => {
          const width = 2 * distance * size
          const simplified = softRings(city, size)
          return [
            new PathLayer<Ring>({
              ...band(
                `city-ring-${index}-mask-${city.slug}`,
                simplified,
                Math.max(0, width - line),
                invisible
              ),
              ...masking,
              visible,
            }),
            new PathLayer<Ring>({
              ...overview,
              ...band(
                `city-ring-${index}-${city.slug}`,
                simplified,
                width + line,
                withOpacity(colors.ink, opacity)
              ),
              ...masked,
              visible: visible && ringsShown > 0,
              opacity: shownOpacity * ringsShown,
            }),
          ]
        })

  return [
    new SolidPolygonLayer<Polygon>({
      ...masking,
      id: `city-mask-${city.slug}`,
      data: polygons,
      getPolygon: (polygon) => polygon,
      getFillColor: invisible,
      visible,
    }),
    new SolidPolygonLayer<Polygon, ScreenOffsetProps>({
      ...overview,
      ...masked,
      id: `city-shadow-${city.slug}`,
      data: polygons,
      getPolygon: (polygon) => polygon,
      getFillColor: colors.shadow,
      visible: visible && shadow > 0,
      opacity: shownOpacity * shadow,
      extensions: [screenOffset, ...(overview?.extensions ?? [])],
      screenOffset: [shadowOffset[0] * shadowOut, shadowOffset[1] * shadowOut],
    }),
    ...ringLayers,
  ]
}

/**
 * Over the grid and the water: the city's limit line. While it draws itself
 * (`show.drawn` below 1), the first part of each of its rings, simplified
 * as the soft rings are (`size`, the square root of the city's area in
 * metres), each ring drawing from its start.
 */
export function cityLimitsLayer(
  city: CityOutline,
  colors: MapColors,
  overview?: OverviewStyle,
  show?: CityShow,
  size?: number
) {
  const opacity = (overview?.opacity ?? 1) * (show?.limits ?? 1)
  const drawn = show?.drawn ?? 1
  const drawing = drawn < 1 && size !== undefined
  return new PathLayer<Ring>({
    ...overview,
    id: `city-limits-${drawing ? "drawing-" : ""}${city.slug}`,
    data: drawing
      ? softRings(city, size).map((ring) => linePart(ring, drawn))
      : outlineRings(city),
    getPath: (ring) => ring,
    getColor: withOpacity(colors.ink, limitOpacity),
    getWidth: limitWidth,
    widthUnits: "pixels",
    jointRounded: true,
    visible: (overview?.visible ?? true) && opacity > 0,
    opacity,
  })
}
