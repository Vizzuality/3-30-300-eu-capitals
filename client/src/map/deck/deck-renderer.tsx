import {
  FlyToInterpolator,
  LinearInterpolator,
  MapView,
  type MapViewState,
} from "@deck.gl/core"
import { getMeterZoom } from "@math.gl/web-mercator"
import { cubicBezier } from "motion"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { motionTokens } from "@/design/tokens"
import type { CapitalSlug } from "@/lib/capitals"
import { allZooms, constrain, type ZoomLimits } from "@/map/camera"
import { useMapCamera, type CameraRequest } from "@/map/map-camera"
import type { MapRendererProps } from "@/map/renderer"
import { baseLayers } from "./base-layers"
import { useCapitalMotion, useNameFont } from "./capital-motion"
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

/** What the pointer is over: a capital's outline, on Home */
const capitalOf = (object: unknown) =>
  (object as { slug?: CapitalSlug } | null)?.slug

export default function DeckRenderer({
  camera,
  colors,
  release,
  home,
  press,
  city,
  capital,
  oneFingerScrolls,
  visible,
}: MapRendererProps) {
  const parent = useRef<HTMLDivElement>(null)
  const [deck, setDeck] = useState<SiteDeck>()
  const [loaded, setLoaded] = useState(false)

  // The capitals under the pointer and clicked, told to the map around
  const homeRef = useRef(home)
  homeRef.current = home
  const hovered = useRef<CapitalSlug | undefined>(undefined)
  // The city overview zoomed into where it is clicked or tapped
  const zoomInRef = useRef(capital?.onPress)
  zoomInRef.current = capital?.onPress

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
      // Picks read back without waiting for the GPU: deck.gl's own pick as
      // a press starts, done synchronously, held the page until every frame
      // queued was drawn (seconds on a slow device), and the press then
      // counted as too long to be a click
      pickAsync: "async",
      layers: [],
      // A flat map: everything is drawn in the order of its layers, as
      // painted on paper, never hidden by what was drawn before
      parameters: { depthCompare: "always", depthWriteEnabled: false },
      // Only the capitals can be picked; the city overview zooms in
      // wherever it is clicked
      getCursor: ({ isDragging, isHovering }) =>
        isDragging
          ? "grabbing"
          : isHovering
            ? "pointer"
            : zoomInRef.current
              ? "zoom-in"
              : "grab",
      onHover: ({ object }) => {
        const slug = homeRef.current ? capitalOf(object) : undefined
        if (slug !== hovered.current) {
          hovered.current = slug
          homeRef.current?.onHover(slug)
        }
      },
      onClick: ({ object, coordinate }) => {
        if (!coordinate) {
          return
        }
        const at: [number, number] = [coordinate[0], coordinate[1]]
        const slug = capitalOf(object)
        if (slug && homeRef.current) {
          homeRef.current.onPress(slug, at)
        } else {
          zoomInRef.current?.(at)
        }
      },
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
          // The visitor's gestures stay within the map's zooms, and inside
          // its rectangle; at a zoom limit, the map stays where it was
          const { limits, size } = camera.state
          const kept = constrain(next, limits, size)
          next =
            kept.zoom === next.zoom
              ? kept
              : constrain(
                  { ...(oldViewState ?? next), zoom: kept.zoom },
                  limits,
                  size
                )
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

  // The layers, drawn again whenever what they show or their motion
  // changes, at most once per change of the page's state
  const names = useMemo(
    () => home?.capitals.map((shown) => shown.name),
    [home?.capitals]
  )
  const nameFont = useNameFont(names)
  const drawn = useRef<() => void>(() => {})
  const queued = useRef(false)
  const redraw = useCallback(() => {
    if (!queued.current) {
      queued.current = true
      queueMicrotask(() => {
        queued.current = false
        drawn.current()
      })
    }
  }, [])
  const motion = useCapitalMotion({ home, press, camera, redraw })
  // Whether the capital's grid has drawn the area in view, by capital
  const capitalRef = useRef(capital)
  capitalRef.current = capital
  const [gridDrawnFor, setGridDrawnFor] = useState<CapitalSlug>()
  const onGridDrawn = useCallback(
    () => setGridDrawnFor(capitalRef.current?.slug),
    []
  )
  // Metres per pixel at the city, to a twentieth of a zoom level: the width
  // of the rings' lines on the ground
  const zoomStep = useMapCamera(camera, ({ camera: shown }) =>
    shown ? Math.round(shown.zoom * 20) / 20 : undefined
  )
  const latitude = capital ? (capital.bbox[1] + capital.bbox[3]) / 2 : undefined
  const metresPerPixel =
    zoomStep === undefined || latitude === undefined
      ? undefined
      : 2 ** (getMeterZoom({ latitude }) - zoomStep)
  drawn.current = () =>
    deck?.setProps({
      layers: baseLayers({
        colors,
        release,
        city,
        capital,
        gridDrawn: capital !== undefined && gridDrawnFor === capital.slug,
        metresPerPixel,
        onGridDrawn,
        capitals: home && {
          capitals: home.capitals,
          focused: home.focused,
          motion,
          nameFont,
        },
        ring: motion.ring,
      }),
    })
  useEffect(redraw, [
    redraw,
    deck,
    colors,
    release,
    city,
    capital,
    gridDrawnFor,
    metresPerPixel,
    home?.capitals,
    home?.focused,
    nameFont,
  ])

  // The capital lifted, for the tests to follow
  useEffect(() => {
    if (parent.current) {
      parent.current.dataset.lifted = home?.lifted ?? ""
    }
  }, [home?.lifted])

  // No capital is under the pointer once the map leaves Home
  useEffect(() => {
    if (!home) {
      hovered.current = undefined
    }
  }, [home])

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
