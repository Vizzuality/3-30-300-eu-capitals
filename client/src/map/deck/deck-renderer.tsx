import {
  FlyToInterpolator,
  LinearInterpolator,
  MapView,
  type MapViewState,
} from "@deck.gl/core"
import { cubicBezier } from "motion"
import { useEffect, useRef, useState } from "react"

import { motionTokens } from "@/design/tokens"
import { allZooms, clampZoom, type ZoomLimits } from "@/map/camera"
import { useMapCamera, type CameraRequest } from "@/map/map-camera"
import type { MapRendererProps } from "@/map/renderer"
import { baseLayers } from "./base-layers"
import { MapGestures, SiteDeck } from "./site-deck"

/*
 * The map drawn by deck.gl: its camera, its gestures and its layers. The
 * instance is made once and lives as long as the page, whatever the page
 * shown, so the map never reloads; it only stops drawing while hidden.
 */

const glide = cubicBezier(...motionTokens.glide.curve)
const linear = new LinearInterpolator(["longitude", "latitude", "zoom"])
// At its usual speed, as the camera's moves expect (see `cameraMove`)
const flight = new FlyToInterpolator()

// Where deck.gl opens before the first move: Europe
const opening: MapViewState = { longitude: 12, latitude: 50, zoom: 3 }

// The camera the rest of the map reads: deck.gl's view state without the
// options it carries along (the zoom range, a transition's settings)
const cameraOf = ({
  longitude,
  latitude,
  zoom,
}: MapViewState): MapViewState => ({ longitude, latitude, zoom })

/** The gestures, in the desktop layout and on the phone's map band */
function controller(oneFingerScrolls: boolean, zoomLimits: ZoomLimits) {
  return {
    type: MapGestures,
    // The map's own keys replace deck.gl's (see the map's focus stop)
    keyboard: false,
    // North stays up
    dragRotate: false,
    touchRotate: false,
    multiTouchDrag: "pan" as const,
    touchZoom: true,
    oneFingerScrolls,
    // Where a mouse wheel's notches may take the zoom
    zoomLimits,
  }
}

// How many deck.gl instances this page has made, to tell each one apart
let decksMade = 0

export default function DeckRenderer({
  camera,
  colors,
  city,
  oneFingerScrolls,
  visible,
}: MapRendererProps) {
  const parent = useRef<HTMLDivElement>(null)
  const [deck, setDeck] = useState<SiteDeck>()
  const [loaded, setLoaded] = useState(false)

  // Made once, never again: navigating, changing the language or resizing
  // the window keeps it, its WebGL context and what it has loaded
  useEffect(() => {
    const element = parent.current
    if (!element) {
      return
    }
    let frames = 0
    // A count, not a random id, which only secure origins have
    decksMade += 1
    element.dataset.deckInstance = String(decksMade)

    const instance = new SiteDeck({
      parent: element,
      // Filling the map's element from the start, before deck.gl sizes it
      style: {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
      },
      views: new MapView({ id: "map" }),
      initialViewState: {
        ...(camera.state.camera ?? opening),
        minZoom: allZooms.min,
        maxZoom: allZooms.max,
      },
      controller: controller(oneFingerScrolls, camera.state.limits),
      // The browser may scroll the page vertically; the desktop layout's
      // map area takes every touch (`touch-action` on the map's element)
      touchAction: "pan-y",
      layers: [],
      onLoad: () => {
        quietCanvas()
        setLoaded(true)
      },
      onAfterRender: () => {
        frames += 1
        element.dataset.frames = String(frames)
      },
      // The camera rests only once deck.gl has finished moving it
      onInteractionStateChange: ({
        isDragging,
        isPanning,
        isZooming,
        isRotating,
        inTransition,
      }) =>
        camera.setMoving(
          Boolean(
            isDragging || isPanning || isZooming || isRotating || inTransition
          )
        ),
      onViewStateChange: ({ viewState, oldViewState, interactionState }) => {
        let next = viewState
        // A drag, a scroll or a pinch; deck.gl also reports the camera when
        // it settles its own view (after a resize)
        const gesture = Boolean(
          interactionState?.isDragging ||
          interactionState?.isPanning ||
          interactionState?.isZooming
        )
        if (gesture) {
          // The visitor's gestures stay within the map's zooms
          const { limits } = camera.state
          const zoom = clampZoom(next.zoom, limits)
          if (zoom !== next.zoom) {
            next = { ...(oldViewState ?? next), zoom }
          }
        }
        camera.report(cameraOf(next), { gesture })
        return next
      },
    })

    // The canvas is not a focus stop of its own: the map's element is.
    // deck.gl's event handling makes it one once WebGL is ready.
    const quietCanvas = () => {
      const canvas = element.querySelector("canvas")
      if (canvas) {
        canvas.tabIndex = -1
        canvas.setAttribute("aria-hidden", "true")
      }
    }
    quietCanvas()

    let last: CameraRequest | undefined
    const carryOut = (request: CameraRequest) => {
      // A hidden map draws no frames, so it cannot glide
      const jump = request.duration === 0 || !instance.isDrawing
      instance.setProps({
        initialViewState: {
          ...distinctFrom(camera.state.camera, request.camera),
          minZoom: allZooms.min,
          maxZoom: allZooms.max,
          transitionDuration: jump ? 0 : request.duration,
          transitionEasing: glide,
          transitionInterpolator: request.flight ? flight : linear,
        },
      })
      // deck.gl reports the frames of a move, not a jump
      if (jump) {
        camera.report(request.camera, { gesture: false })
      }
    }
    const unsubscribe = camera.subscribe(() => {
      const { request } = camera.state
      if (request && request !== last) {
        last = request
        carryOut(request)
      }
    })
    if (camera.state.request) {
      last = camera.state.request
      carryOut(last)
    }

    setDeck(instance)
    return () => {
      unsubscribe()
      instance.finalize()
      // Its canvas too, which deck.gl leaves while its WebGL context is
      // still being made (React's strict mode, in development, unmounts
      // once at once)
      element.replaceChildren()
      delete element.dataset.deckInstance
    }
    // The instance is made once; later props are passed below
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const zoomLimits = useMapCamera(camera, (state) => state.limits)
  useEffect(() => {
    deck?.setProps({ controller: controller(oneFingerScrolls, zoomLimits) })
  }, [deck, oneFingerScrolls, zoomLimits])

  useEffect(() => {
    deck?.setProps({
      layers: baseLayers({ colors, city }),
    })
  }, [deck, colors, city])

  // Stops drawing while hidden (once deck.gl has started)
  useEffect(() => {
    if (deck && loaded) {
      deck.setDrawing(visible)
      if (parent.current) {
        parent.current.dataset.drawing = String(visible)
      }
    }
  }, [deck, loaded, visible])

  return <div ref={parent} className="absolute inset-0" />
}

/**
 * The camera to send to deck.gl. During a move, deck.gl takes a camera
 * equal to the one it is drawing for an echo of its own move, and keeps
 * going (to the right after Right then Left, pressed together); such a
 * camera is moved by about a tenth of a millimetre, so it is taken as a new
 * move from where the camera is.
 */
function distinctFrom(
  drawn: MapViewState | undefined,
  next: MapViewState
): MapViewState {
  const same =
    drawn !== undefined &&
    Math.abs(drawn.longitude - next.longitude) < 1e-9 &&
    Math.abs(drawn.latitude - next.latitude) < 1e-9 &&
    Math.abs(drawn.zoom - next.zoom) < 1e-9
  return same ? { ...next, longitude: next.longitude + 1e-9 } : next
}
