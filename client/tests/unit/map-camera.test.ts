import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import type { MapViewState } from "@deck.gl/core"

import {
  addressArea,
  applyAction,
  areaInView,
  constrain,
  insideZoom,
  limitsFor,
  cameraMove,
  fitArea,
  keyAction,
  longestMove,
  panStep,
  streetCamera,
  streetScale,
  zoomLimits,
  zoomRoom,
  type Size,
} from "@/map/camera"
import { MapCamera, settleDelay } from "@/map/map-camera"
import { toRgba } from "@/map/map-colors"
import {
  formatVisibleArea,
  groundWidth,
  mapViewOf,
  parseVisibleArea,
  streetLevelWidth,
  type VisibleArea,
} from "@/lib/visible-area"

const desktop: Size = { width: 800, height: 720 }

// The Glide token's duration, in milliseconds
const glide = 760

// About 1.1 km across, on Södermalm
const sodermalm: VisibleArea = {
  west: 18.0603,
  south: 59.3105,
  east: 18.0802,
  north: 59.3201,
}

const key = (name: string, modifiers: Partial<KeyboardEvent> = {}) =>
  keyAction({
    key: name,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...modifiers,
  })

const decimals = (edge: string) => edge.split(".")[1]?.length ?? 0

describe("the area in the address", () => {
  test("street level is written to 5 decimals at most, about a metre", () => {
    const street = { longitude: 18.071234, latitude: 59.312345, zoom: 15.3 }
    const written = addressArea(street, desktop)

    expect(Math.max(...written.split(",").map(decimals))).toBe(5)
  })

  test("Europe is written with fewer decimals: a pixel spans more", () => {
    const europe = { west: -11, south: 34, east: 35, north: 62 }
    const written = addressArea(fitArea(europe, desktop), desktop)

    expect(Math.max(...written.split(",").map(decimals))).toBe(2)
  })

  test("opened again, it shows the same area, to the pixel", () => {
    for (const size of [desktop, { width: 390, height: 366 }]) {
      const camera = fitArea(sodermalm, size)
      const written = addressArea(camera, size)
      const area = parseVisibleArea(written)
      if (!area) {
        throw new Error(`"${written}" does not read back`)
      }
      const reopened = fitArea(area, size)
      const pixel = 360 / (512 * 2 ** camera.zoom)

      expect(Math.abs(reopened.longitude - camera.longitude)).toBeLessThan(
        pixel
      )
      expect(Math.abs(reopened.latitude - camera.latitude)).toBeLessThan(pixel)
      expect(Math.abs(reopened.zoom - camera.zoom)).toBeLessThan(0.01)
    }
  })

  test("an area beyond the world's edges is cut to them, so it reads back", () => {
    const written = formatVisibleArea(
      { west: -200, south: -88, east: 210, north: 89 },
      0.5
    )

    expect(written).toBe("-180,-85,180,85")
    expect(parseVisibleArea(written)).toBeDefined()
  })
})

describe("the map's keys", () => {
  test("the arrow keys pan, + and − zoom", () => {
    expect(key("ArrowLeft")).toEqual({ kind: "pan", by: [-panStep, 0] })
    expect(key("ArrowRight")).toEqual({ kind: "pan", by: [panStep, 0] })
    expect(key("ArrowUp")).toEqual({ kind: "pan", by: [0, -panStep] })
    expect(key("ArrowDown")).toEqual({ kind: "pan", by: [0, panStep] })
    for (const plus of ["+", "="]) {
      expect(key(plus)).toEqual({ kind: "zoom", by: 1 })
    }
    for (const minus of ["-", "_", "−"]) {
      expect(key(minus)).toEqual({ kind: "zoom", by: -1 })
    }
  })

  test("other keys, and keys with Alt, Ctrl or Cmd, are left to others", () => {
    for (const other of ["Tab", "Enter", "Escape", " ", "a"]) {
      expect(key(other)).toBeUndefined()
    }
    expect(key("ArrowLeft", { altKey: true })).toBeUndefined()
    expect(key("+", { ctrlKey: true })).toBeUndefined()
    expect(key("-", { metaKey: true })).toBeUndefined()
  })

  test("the up arrow shows more of the north, the right arrow of the east", () => {
    const camera: MapViewState = { longitude: 18, latitude: 59.3, zoom: 14 }
    const limits = zoomLimits.capital
    const up = applyAction(
      camera,
      { kind: "pan", by: [0, -panStep] },
      limits,
      desktop
    )
    const right = applyAction(
      camera,
      { kind: "pan", by: [panStep, 0] },
      limits,
      desktop
    )

    expect(up.latitude).toBeGreaterThan(camera.latitude)
    expect(up.longitude).toBeCloseTo(camera.longitude, 9)
    expect(right.longitude).toBeGreaterThan(camera.longitude)
    expect(right.latitude).toBeCloseTo(camera.latitude, 9)
  })

  test("zooming stops at the map's limits, which disable the buttons", () => {
    const limits = zoomLimits.capital
    const nearMax: MapViewState = {
      longitude: 18,
      latitude: 59.3,
      zoom: limits.max - 0.4,
    }
    const atMax = applyAction(nearMax, { kind: "zoom", by: 1 }, limits, desktop)

    expect(atMax.zoom).toBe(limits.max)
    expect(zoomRoom(atMax, limits)).toEqual({
      canZoomIn: false,
      canZoomOut: true,
    })
    const atMin = applyAction(
      { ...atMax, zoom: limits.min },
      { kind: "zoom", by: -1 },
      limits,
      desktop
    )
    expect(atMin.zoom).toBe(limits.min)
    expect(zoomRoom(atMin, limits)).toEqual({
      canZoomIn: true,
      canZoomOut: false,
    })
  })
})

describe("how the camera moves", () => {
  const city: MapViewState = { longitude: 18, latitude: 59.3, zoom: 11 }

  test("a nearby move glides in 760 ms", () => {
    const nearby = applyAction(
      city,
      { kind: "zoom", by: 1 },
      zoomLimits.capital,
      desktop
    )

    expect(cameraMove(city, nearby, desktop, false)).toEqual({
      duration: 760,
      flight: false,
    })
  })

  test("a far one flies, longer, but never more than 1.5 s", () => {
    const europe: MapViewState = { longitude: 12, latitude: 48, zoom: 3.6 }
    const move = cameraMove(europe, city, desktop, false)

    expect(move.flight).toBe(true)
    expect(move.duration).toBeGreaterThan(760)
    expect(move.duration).toBeLessThanOrEqual(longestMove)
  })

  test("under reduced motion it jumps", () => {
    const europe: MapViewState = { longitude: 12, latitude: 48, zoom: 3.6 }

    expect(cameraMove(europe, city, desktop, true)).toEqual({
      duration: 0,
      flight: false,
    })
  })
})

/** A camera on a desktop map, its moves carried out at once */
function mapCamera() {
  const camera = new MapCamera()
  camera.setLimits(zoomLimits.capital)
  const settled: Array<MapViewState> = []
  camera.onSettle = (shown) => settled.push(shown)
  camera.setSize(desktop)
  let carried = 0
  camera.subscribe(() => {
    const { request } = camera.state
    if (request && request.id !== carried) {
      carried = request.id
      camera.report(request.camera, { gesture: false })
    }
  })
  return { camera, settled }
}

describe("the camera shared around the map", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test("in a rectangle, the area in view never leaves it, by any move", () => {
    const { camera } = mapCamera()
    // Stockholm's overview rectangle, and its desktop least zoom
    const bounds = {
      west: 17.245,
      south: 58.977,
      east: 18.7158,
      north: 59.6799,
    }
    camera.setLimits({ min: 9.37, max: 18, bounds })
    const inside = () => {
      const area = areaInView(camera.state.camera as MapViewState, desktop)
      const hair = 1e-9
      return (
        area.west >= bounds.west - hair &&
        area.east <= bounds.east + hair &&
        area.south >= bounds.south - hair &&
        area.north <= bounds.north + hair
      )
    }

    // Asked for a far wider area: the farthest zoom the limits allow
    camera.go({ area: { west: 16, south: 58, east: 20, north: 61 } }, "page")
    expect(inside()).toBe(true)
    expect(camera.state.camera?.zoom).toBeCloseTo(
      Math.max(9.37, insideZoom(bounds, desktop)),
      6
    )

    // Panned against its edge, and zoomed out at it
    camera.go({ area: sodermalm }, "page")
    for (let step = 0; step < 40; step += 1) {
      camera.act({ kind: "pan", by: [panStep, -panStep] })
    }
    expect(inside()).toBe(true)
    camera.act({ kind: "zoom", by: -1 })
    camera.act({ kind: "zoom", by: -1 })
    expect(inside()).toBe(true)
  })

  test("a rectangle no wider than the map allows keeps the map's own least zoom", () => {
    const bounds = {
      west: 17.245,
      south: 58.977,
      east: 18.7158,
      north: 59.6799,
    }
    const phone: Size = { width: 412, height: 386 }
    // The band shows the rectangle in full from zoom 7.6 or so
    expect(insideZoom(bounds, phone)).toBeLessThan(7.63)
    expect(limitsFor({ min: 7.63, max: 18, bounds }, phone).min).toBe(7.63)
    expect(limitsFor({ min: 7.63, max: 18, bounds }, desktop).min).toBeCloseTo(
      insideZoom(bounds, desktop),
      6
    )
  })

  test("a camera already inside is left as it is", () => {
    const bounds = {
      west: 17.245,
      south: 58.977,
      east: 18.7158,
      north: 59.6799,
    }
    const limits = { min: 9, max: 18, bounds }
    const centred = { longitude: 18.07, latitude: 59.33, zoom: 12 }
    expect(constrain(centred, limits, desktop)).toEqual(centred)
  })

  test("a move asked for before the map has a size waits for it, then jumps", () => {
    const camera = new MapCamera()
    camera.setLimits(zoomLimits.capital)
    camera.go({ area: sodermalm }, "page")

    expect(camera.state.request).toBeUndefined()
    camera.setSize(desktop)
    expect(camera.state.request?.duration).toBe(0)
    expect(camera.state.request?.camera).toEqual(fitArea(sodermalm, desktop))
  })

  test("the visitor's moves settle into the address; the page's do not", () => {
    const { camera, settled } = mapCamera()
    camera.go({ area: sodermalm }, "page")
    vi.advanceTimersByTime(settleDelay * 2)
    expect(settled).toEqual([])

    camera.act({ kind: "zoom", by: 1 })
    camera.act({ kind: "zoom", by: 1 })
    // Once the glide has had its time, and the camera has rested
    vi.advanceTimersByTime(glide + settleDelay - 1)
    expect(settled).toEqual([])
    vi.advanceTimersByTime(1)
    expect(settled).toHaveLength(1)
    // Two presses add up, from where the first one ends
    expect(settled[0].zoom).toBeCloseTo(fitArea(sodermalm, desktop).zoom + 2, 9)
  })

  test("a gesture settles into the address too", () => {
    const { camera, settled } = mapCamera()
    camera.go({ area: sodermalm }, "page")
    camera.report(
      { longitude: 18.07, latitude: 59.31, zoom: 15 },
      { gesture: true }
    )
    vi.advanceTimersByTime(settleDelay)

    expect(settled).toEqual([{ longitude: 18.07, latitude: 59.31, zoom: 15 }])
  })

  test("a slow move settles only once it has had its time", () => {
    const camera = new MapCamera()
    camera.setLimits(zoomLimits.capital)
    const settled: Array<MapViewState> = []
    camera.onSettle = (shown) => settled.push(shown)
    camera.setSize(desktop)
    camera.go({ area: sodermalm }, "page")
    const start = camera.state.request?.camera as MapViewState
    camera.report(start, { gesture: false })

    camera.act({ kind: "zoom", by: 1 })
    // One frame of the glide, then none for longer than the settle delay
    camera.report({ ...start, zoom: start.zoom + 0.3 }, { gesture: false })
    vi.advanceTimersByTime(settleDelay * 1.5)
    expect(settled).toEqual([])

    // The last frame comes late: the camera settles where it was, then
    // again where the glide ends
    vi.advanceTimersByTime(glide)
    expect(settled).toEqual([{ ...start, zoom: start.zoom + 0.3 }])
    camera.report({ ...start, zoom: start.zoom + 1 }, { gesture: false })
    vi.advanceTimersByTime(settleDelay)
    expect(settled.at(-1)).toEqual({ ...start, zoom: start.zoom + 1 })
  })

  test("moving to another page forgets the visitor's last moves", () => {
    const { camera, settled } = mapCamera()
    camera.go({ area: sodermalm }, "page")
    camera.act({ kind: "pan", by: [panStep, 0] })
    // Another page opens before the move has settled
    camera.go({ area: { west: -11, south: 34, east: 35, north: 62 } }, "page")
    vi.advanceTimersByTime(settleDelay * 2)

    expect(settled).toEqual([])
  })

  test("only the visitor's moves count as moving the map, gestures included", () => {
    const { camera } = mapCamera()
    camera.go({ area: sodermalm }, "page")
    expect(camera.state.visitorMoves).toBe(0)

    camera.act({ kind: "zoom", by: 1 })
    expect(camera.state.visitorMoves).toBe(1)
    camera.go({ area: sodermalm }, "visitor")
    expect(camera.state.visitorMoves).toBe(2)
    // A drag, one move per frame; a frame of a move asked for is not one
    const shown = camera.state.camera as MapViewState
    camera.report(
      { ...shown, longitude: shown.longitude + 0.01 },
      { gesture: true }
    )
    expect(camera.state.visitorMoves).toBe(3)
    camera.report(shown, { gesture: false })
    expect(camera.state.visitorMoves).toBe(3)
  })

  test("a shared area smaller than the closest zoom opens at that zoom", () => {
    const { camera } = mapCamera()
    const tiny = { west: 18.07, south: 59.315, east: 18.0701, north: 59.31505 }
    camera.go({ area: tiny }, "page")

    expect(camera.state.camera?.zoom).toBe(zoomLimits.capital.max)
  })
})

describe("zooming in from the city overview", () => {
  const phone: Size = { width: 412, height: 386 }
  const stockholm = [18.0686, 59.3293] as const
  const valletta = [14.5146, 35.8989] as const

  test("centres the place clicked, at the street's scale, the same everywhere", () => {
    for (const place of [stockholm, valletta]) {
      for (const size of [desktop, phone]) {
        const street = streetCamera(place, size, zoomLimits.capital)
        expect([street.longitude, street.latitude]).toEqual([...place])
        const area = areaInView(street, size)
        expect(groundWidth(area) / size.width).toBeCloseTo(streetScale, 2)
        expect(mapViewOf(area)).toBe("street")
      }
    }
  })

  test("a map too wide for the street at that scale still lands at street level", () => {
    const wide: Size = { width: 3360, height: 2000 }
    const street = streetCamera(stockholm, wide, zoomLimits.capital)

    expect(groundWidth(areaInView(street, wide))).toBeLessThan(streetLevelWidth)
  })

  test("never past the map's zooms", () => {
    const limits = { min: 9, max: 15 }
    expect(streetCamera(stockholm, desktop, limits).zoom).toBe(15)
  })
})

describe("the map's colours", () => {
  test("tokens as red, green, blue and alpha, with or without alpha", () => {
    expect(toRgba("#dde8e6")).toEqual([221, 232, 230, 255])
    expect(toRgba("#2e2a2529")).toEqual([46, 42, 37, 41])
    expect(() => toRgba("red")).toThrow("is not a #rrggbb or #rrggbbaa colour")
  })
})
