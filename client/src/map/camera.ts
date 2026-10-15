import type { MapViewState } from "@deck.gl/core"
import {
  WebMercatorViewport,
  fitBounds,
  getBounds,
  getFlyToDuration,
} from "@math.gl/web-mercator"

import { motionTokens } from "@/design/tokens"
import { formatVisibleArea, type VisibleArea } from "@/lib/visible-area"

/*
 * What moves the map's camera beyond the gestures deck.gl handles itself:
 * the keys common to every view (the arrow keys pan, + and − zoom), the
 * zoom buttons, each map's zoom limits, and how long each move glides. The
 * maths of the camera are deck.gl's own, from math.gl (`@math.gl/web-mercator`,
 * which deck.gl's `WebMercatorViewport` and `FlyToInterpolator` build on),
 * so the first page has them without loading deck.gl.
 */

/** The map's size on screen, in CSS pixels */
export type Size = { width: number; height: number }

/** Room kept clear around an area fitted to the map, in CSS pixels */
export type Padding = {
  top: number
  right: number
  bottom: number
  left: number
}

/** deck.gl's view of a camera on a map of this size */
export const viewportOf = (camera: MapViewState, size: Size) =>
  new WebMercatorViewport({ ...camera, ...size })

/**
 * The camera that shows the whole area as large as the map allows, inside
 * the padding, whatever the map's shape: a shared area therefore shows the
 * same place on a phone and on a desktop, with more around it on one side
 */
export function fitArea(
  { west, south, east, north }: VisibleArea,
  size: Size,
  padding?: Padding
): MapViewState {
  return fitBounds({
    ...size,
    bounds: [
      [west, south],
      [east, north],
    ],
    padding,
    maxZoom: allZooms.max,
  })
}

/** The area the camera shows */
export function areaInView(camera: MapViewState, size: Size): VisibleArea {
  const corners = getBounds(viewportOf(camera, size))
  const longitudes = corners.map(([longitude]) => longitude)
  const latitudes = corners.map(([, latitude]) => latitude)
  return {
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    north: Math.max(...latitudes),
  }
}

/** Metres on the ground in one CSS pixel, at the centre of the map */
export function metresPerPixel(camera: MapViewState, size: Size) {
  const viewport = viewportOf(camera, size)
  return viewport.distanceScales.metersPerUnit[0] / viewport.scale
}

/**
 * The area in view as the address writes it (`at`), each edge rounded to
 * what a pixel of the map needs: a pixel's smallest side in degrees (its
 * height, in Web Mercator)
 */
export function addressArea(camera: MapViewState, size: Size) {
  const area = areaInView(camera, size)
  const degreesPerPixel = Math.min(
    (area.east - area.west) / size.width,
    (area.north - area.south) / size.height
  )
  return formatVisibleArea(area, degreesPerPixel)
}

/** Which map is shown: Europe on Home, or a capital */
export type MapKind = "home" | "capital"

export type ZoomLimits = { min: number; max: number }

/**
 * How far each map zooms. Europe from the whole continent to a region; a
 * capital from more than the whole city down to a few buildings (its tiles
 * stop at zoom 16, and the map enlarges the last ones beyond).
 */
export const zoomLimits: Record<MapKind, ZoomLimits> = {
  home: { min: 3, max: 8 },
  capital: { min: 9, max: 18 },
}

/** Every zoom the camera may pass through, while flying between maps */
export const allZooms: ZoomLimits = {
  min: Math.min(zoomLimits.home.min, zoomLimits.capital.min),
  max: Math.max(zoomLimits.home.max, zoomLimits.capital.max),
}

/** The area of Europe the Home map opens on: the 27 capitals, with room */
export const europeArea: VisibleArea = {
  west: -11,
  south: 34,
  east: 35,
  north: 62,
}

/** A move asked for by a key or a button */
export type CameraAction =
  | { kind: "pan"; by: readonly [number, number] }
  | { kind: "zoom"; by: 1 | -1 }

/** How far an arrow key pans, in CSS pixels */
export const panStep = 100

type Key = {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}

/**
 * The move a key asks for on the map, or undefined when the map leaves the
 * key to others (Tab, Enter, and any key with Alt, Ctrl or Cmd, which the
 * browser uses). + is also = and − also _, the same keys without and with
 * Shift on most keyboards, so either zooms.
 */
export function keyAction({
  key,
  altKey,
  ctrlKey,
  metaKey,
}: Key): CameraAction | undefined {
  if (altKey || ctrlKey || metaKey) {
    return undefined
  }
  switch (key) {
    case "ArrowLeft":
      return { kind: "pan", by: [-panStep, 0] }
    case "ArrowRight":
      return { kind: "pan", by: [panStep, 0] }
    case "ArrowUp":
      return { kind: "pan", by: [0, -panStep] }
    case "ArrowDown":
      return { kind: "pan", by: [0, panStep] }
    case "+":
    case "=":
      return { kind: "zoom", by: 1 }
    case "-":
    case "_":
    case "−":
      return { kind: "zoom", by: -1 }
    default:
      return undefined
  }
}

/** A hair of zoom, so a camera exactly at a limit counts as being there */
const EPSILON = 1e-6

/** Whether the camera can zoom further in and out */
export function zoomRoom(camera: MapViewState, limits: ZoomLimits) {
  return {
    canZoomIn: camera.zoom < limits.max - EPSILON,
    canZoomOut: camera.zoom > limits.min + EPSILON,
  }
}

/** Keeps a zoom within the limits */
export function clampZoom(zoom: number, limits: ZoomLimits) {
  return Math.min(limits.max, Math.max(limits.min, zoom))
}

/**
 * Where the camera goes for a key or a button: panned by some pixels (the
 * place that far from the centre comes to the centre), or one zoom level
 * closer or farther, around the centre, never past the limits
 */
export function applyAction(
  camera: MapViewState,
  action: CameraAction,
  limits: ZoomLimits,
  size: Size
): MapViewState {
  if (action.kind === "zoom") {
    return { ...camera, zoom: clampZoom(camera.zoom + action.by, limits) }
  }
  const viewport = viewportOf(camera, size)
  const centre = [size.width / 2, size.height / 2]
  // The place that far from the centre, brought to the centre
  const [longitude, latitude] = viewport.getMapCenterByLngLatPosition({
    lngLat: viewport.unproject([
      centre[0] + action.by[0],
      centre[1] + action.by[1],
    ]),
    pos: centre,
  })
  return { ...camera, longitude, latitude }
}

/** The longest a camera move may take, in milliseconds */
export const longestMove = 1500

/**
 * How the camera goes from one place to another: a glide (the Glide token,
 * 760 ms) for a nearby move, a flight that rises and comes down again
 * (deck.gl's, as long as the distance needs, from 760 ms to 1.5 s) for a far
 * one, such as from Europe to a capital. Under reduced motion it jumps.
 */
export function cameraMove(
  from: MapViewState,
  to: MapViewState,
  size: Size,
  reducedMotion: boolean
): { duration: number; flight: boolean } {
  if (reducedMotion) {
    return { duration: 0, flight: false }
  }
  const levels = Math.abs(to.zoom - from.zoom)
  // How far the centre moves, in screens, at the farther of the two zooms
  const farther = from.zoom < to.zoom ? from : to
  const [x, y] = viewportOf(farther, size).project([to.longitude, to.latitude])
  const [x0, y0] = viewportOf(farther, size).project([
    from.longitude,
    from.latitude,
  ])
  const screens =
    Math.hypot(x - x0, y - y0) / Math.max(1, size.width, size.height)
  const far = levels >= 2 || screens > 1
  const glide = motionTokens.glide.duration
  if (!far) {
    return { duration: glide, flight: false }
  }
  // As long as deck.gl's flight takes at its usual speed (its own cap,
  // `maxDuration`, would skip a longer flight altogether)
  const duration = getFlyToDuration(
    { ...from, ...size },
    { ...to, ...size },
    {}
  )
  return {
    duration: Math.min(longestMove, Math.max(glide, duration)),
    flight: true,
  }
}
