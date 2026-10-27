import {
  FlyToInterpolator,
  LinearInterpolator,
  MapView,
  type MapViewState,
  type PickingInfo,
} from "@deck.gl/core"
import { getMeterZoom } from "@math.gl/web-mercator"
import { cubicBezier } from "motion"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { motionTokens } from "@/design/tokens"
import type { CapitalSlug } from "@/lib/capitals"
import {
  allZooms,
  areaInView,
  constrain,
  viewportOf,
  type ZoomLimits,
} from "@/map/camera"
import { useMapCamera, type CameraRequest } from "@/map/map-camera"
import type { MapRendererProps } from "@/map/renderer"
import {
  buildingStride,
  type CityTileContent,
} from "@/map/deck/city-tile-decode"
import { keyboardFacades } from "@/lib/building-evidence"
import { roadFade } from "@/lib/overview-roads"
import { mergeBuildings, type StreetBuilding } from "@/lib/street-buildings"
import { groundWidth, mapViewOf } from "@/lib/visible-area"
import { baseLayers } from "./base-layers"
import { useCapitalMotion, useNameFont, usePixelRatio } from "./capital-motion"
import { prefetchCityTiles } from "./city-tile-layer"
import { MapGestures, SiteDeck } from "./site-deck"
import { facadeHitId, selectionLayers } from "./selection-layers"
import { useSelectionMotion } from "./selection-motion"
import { streetLayers } from "./street-layers"
import { useStreetMotion } from "./street-motion"
import { placeNamesLayer, usePlaceNames } from "./place-names"
import {
  streetNamesLayer,
  useStreetNameFont,
  useStreetNames,
} from "./street-names"

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

/**
 * How far a press may move and still select at street level, in CSS
 * pixels: under deck.gl's pan threshold (1 px), past which a mouse or pen
 * drags the map; a finger on the phone's band never moves the map, so it
 * keeps deck.gl's own allowance for a tap (9 px)
 */
const pressSlop = { drag: 1, tap: 9 } as const

// How many deck.gl instances this page has made, to tell each one apart
let decksMade = 0

/** What the pointer is over: a capital's outline, on Home */
const capitalOf = (object: unknown) =>
  (object as { slug?: CapitalSlug } | null)?.slug

/** What the pointer is over: a facade of the selected building */
function facadeOf(info: { layer?: { id: string } | null; object?: unknown }) {
  return info.layer?.id === facadeHitId
    ? (info.object as { sid?: number } | null)?.sid
    : undefined
}

/** What the pointer is over at street level: a building with results */
function buildingOf(info: { layer?: { id: string } | null; object?: unknown }) {
  if (!info.layer?.id.startsWith("street-objects")) {
    return undefined
  }
  const properties = (
    info.object as { properties?: { id?: number; scored?: number } } | null
  )?.properties
  return properties?.scored === 1 ? properties.id : undefined
}

/** The buildings with results of the tiles in view, as one list */
function buildingsOf(
  tiles: ReadonlyArray<CityTileContent>
): Array<StreetBuilding> {
  return mergeBuildings(
    tiles.map(({ buildings }) => {
      const found: Array<StreetBuilding> = []
      for (let at = 0; at < buildings.length; at += buildingStride) {
        found.push({
          id: buildings[at],
          score: buildings[at + 1],
          longitude: buildings[at + 2],
          latitude: buildings[at + 3],
          area: buildings[at + 4],
        })
      }
      return found
    })
  )
}

export default function DeckRenderer({
  camera,
  colors,
  release,
  home,
  press,
  city,
  capital,
  street,
  selection,
  oneFingerScrolls,
  visible,
}: MapRendererProps) {
  const parent = useRef<HTMLDivElement>(null)
  const [deck, setDeck] = useState<SiteDeck>()
  const deckRef = useRef<SiteDeck | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)

  // The capitals under the pointer and clicked, told to the map around
  const homeRef = useRef(home)
  homeRef.current = home
  const hovered = useRef<CapitalSlug | undefined>(undefined)
  // The city overview zoomed into where it is clicked or tapped
  const zoomInRef = useRef(capital?.onPress)
  zoomInRef.current = capital?.onPress
  // The street level, and the building with results under the pointer
  const streetRef = useRef(street)
  streetRef.current = street
  const [hoveredBuilding, setHoveredBuilding] = useState<number>()
  const hoveredRef = useRef(hoveredBuilding)
  const streetHoverRef = useRef<(id: number | undefined) => void>(() => {})
  hoveredRef.current = hoveredBuilding
  // A selected building, and the facade under the pointer
  const selectionRef = useRef(selection)
  selectionRef.current = selection
  const hoveredFacade = useRef<number | undefined>(undefined)
  // Presses on the map, counted, so a press read late is dropped
  const presses = useRef(0)
  const oneFingerRef = useRef(oneFingerScrolls)
  oneFingerRef.current = oneFingerScrolls
  const noteSelectionRef = useRef<() => void>(() => {})

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
    // Nothing under the pointer yet, for the tests to follow
    element.dataset.hoveredBuilding = ""
    element.dataset.hoveredFacade = ""

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
          : isHovering &&
              (homeRef.current ||
                hoveredRef.current !== undefined ||
                hoveredFacade.current !== undefined)
            ? "pointer"
            : zoomInRef.current
              ? "zoom-in"
              : "grab",
      onHover: (info) => {
        const slug = homeRef.current ? capitalOf(info.object) : undefined
        if (slug !== hovered.current) {
          hovered.current = slug
          homeRef.current?.onHover(slug)
        }
        hoveredFacade.current = selectionRef.current
          ? facadeOf(info)
          : undefined
        element.dataset.hoveredFacade = String(hoveredFacade.current ?? "")
        const building =
          streetRef.current && hoveredFacade.current === undefined
            ? buildingOf(info)
            : undefined
        if (building !== hoveredRef.current) {
          hoveredRef.current = building
          // Lifted at once, then the cursor follows React's render
          streetHoverRef.current(building)
          setHoveredBuilding(building)
          element.dataset.hoveredBuilding = String(building ?? "")
        }
      },
      onClick: (info) => {
        const { object, coordinate } = info
        if (!coordinate) {
          return
        }
        const at: [number, number] = [coordinate[0], coordinate[1]]
        const slug = capitalOf(object)
        // At street level, presses are the map's own (see `onPress`)
        if (streetRef.current) {
          return
        }
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
        noteSelectionRef.current()
      },
      // The camera rests only once deck.gl has finished moving it; a drag
      // or a pan drops a press still being resolved
      onInteractionStateChange: ({
        isDragging,
        isPanning,
        isZooming,
        isRotating,
        inTransition,
      }) => {
        if (isDragging || isPanning) {
          presses.current += 1
        }
        camera.setMoving(
          Boolean(
            isDragging || isPanning || isZooming || isRotating || inTransition
          )
        )
      },
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

    // At street level, a building or a facade is chosen by the map itself,
    // not by deck.gl's click: a press and a release of the same pointer that
    // has not moved the map, then what lies under it, read back from the
    // GPU without waiting (`pickObjectAsync`). A later press, or a drag,
    // drops an earlier press still being read.
    let pressed:
      | { pointer: number; x: number; y: number; slop: number; seq: number }
      | undefined
    const onPointerDown = (event: PointerEvent) => {
      presses.current += 1
      pressed =
        streetRef.current && event.isPrimary && event.button === 0
          ? {
              pointer: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              slop:
                event.pointerType === "touch" && oneFingerRef.current
                  ? pressSlop.tap
                  : pressSlop.drag,
              seq: presses.current,
            }
          : undefined
    }
    const onPointerUp = (event: PointerEvent) => {
      const down = pressed
      pressed = undefined
      if (
        !down ||
        down.pointer !== event.pointerId ||
        down.seq !== presses.current ||
        Math.hypot(event.clientX - down.x, event.clientY - down.y) >= down.slop
      ) {
        return
      }
      const box = element.getBoundingClientRect()
      const x = event.clientX - box.left
      const y = event.clientY - box.top
      const slug = capitalRef.current?.slug
      void instance
        .pickObjectAsync({
          x,
          y,
          layerIds: [`street-objects-${slug}`, facadeHitId],
        })
        .then((info) => {
          if (down.seq !== presses.current || !streetRef.current) {
            return
          }
          onPress(info, x, y)
        })
        .catch(() => undefined)
    }
    const onPress = (info: PickingInfo | null, x: number, y: number) => {
      const viewport = instance.getViewports()[0]
      const point = info?.coordinate ?? viewport?.unproject([x, y])
      if (!point) {
        return
      }
      const at: [number, number] = [point[0], point[1]]
      const facade = info && selectionRef.current ? facadeOf(info) : undefined
      const building = info ? buildingOf(info) : undefined
      if (facade !== undefined) {
        selectionRef.current?.onFacadePress(facade)
      } else if (building !== undefined) {
        streetRef.current?.onPress(building, at)
      } else {
        selectionRef.current?.onElsewhere()
      }
    }
    const onPointerCancel = () => {
      pressed = undefined
    }
    element.addEventListener("pointerdown", onPointerDown)
    element.addEventListener("pointerup", onPointerUp)
    element.addEventListener("pointercancel", onPointerCancel)

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
    deckRef.current = instance
    return () => {
      unsubscribe()
      element.removeEventListener("pointerdown", onPointerDown)
      element.removeEventListener("pointerup", onPointerUp)
      element.removeEventListener("pointercancel", onPointerCancel)
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
  const redrawNow = useCallback(() => {
    drawn.current()
    deckRef.current?.applyLayersNow()
  }, [])
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
  // The street level: drawn once the area in view is narrower than the
  // street level's width, from the city tiles the release has
  const cityArea = capital?.archives.city ? capital.cityArea : undefined
  const streetView = useMapCamera(
    camera,
    ({ camera: shown, size }) =>
      shown !== undefined &&
      size.width > 0 &&
      mapViewOf(areaInView(shown, size)) === "street"
  )
  // A selected building keeps the street, even zoomed out to its circle
  const onStreet =
    (streetView || selection !== undefined) && cityArea !== undefined
  // The overview's main roads, fading out as the street level nears, to a
  // twentieth of their opacity
  const roadOpacity = useMapCamera(camera, ({ camera: shown, size }) =>
    shown !== undefined && size.width > 0
      ? Math.round(roadFade(groundWidth(areaInView(shown, size))) * 20) / 20
      : 1
  )
  // The buildings lifted, for the tests to follow, as they are drawn
  const liftedRef = useRef<ReadonlyArray<{ id: number }>>([])
  const noteLifted = useCallback(() => {
    if (parent.current) {
      parent.current.dataset.liftedBuildings = liftedRef.current
        .filter(({ id }) => id !== -1)
        .map(({ id }) => id)
        .join()
    }
  }, [])
  const repaint = useCallback(() => {
    deck?.drawSoon("street")
    noteLifted()
  }, [deck, noteLifted])
  // The selected building and what is drawn of it, for the tests to follow:
  // its id, rule and facade while their evidence shows, whether it has
  // finished arriving, the facade ringed in keyboard focus, and where its
  // facades are on screen, in the keyboard's order
  const noteSelection = () => {
    const element = parent.current
    if (!element) {
      return
    }
    const { shown } = scene
    const arrived = shown !== undefined && scene.evidence > 0
    element.dataset.selectedBuilding = arrived
      ? String(shown.building.record.id)
      : ""
    element.dataset.selectionRule = arrived ? String(shown.rule) : ""
    element.dataset.selectionFacade =
      arrived && shown.facade !== undefined ? String(shown.facade) : ""
    element.dataset.selectionSettled = String(arrived && scene.settled)
    element.dataset.focusedFacade = String(selection?.focusedFacade ?? "")
    const view = camera.state.camera
    element.dataset.facades =
      arrived && shown.rule === 3 && view
        ? JSON.stringify(
            keyboardFacades(shown.building).flatMap(
              ({ sid, passes, pieces }) => {
                const piece = pieces[0]
                if (!piece || piece.length < 2) {
                  return []
                }
                const viewport = viewportOf(view, camera.state.size)
                const [x0, y0] = viewport.project(piece[0])
                const [x1, y1] = viewport.project(piece[1])
                return [
                  {
                    sid,
                    passes,
                    x: Math.round((x0 + x1) / 2),
                    y: Math.round((y0 + y1) / 2),
                  },
                ]
              }
            )
          )
        : ""
  }
  noteSelectionRef.current = noteSelection
  const streetMotion = useStreetMotion({
    camera,
    street: onStreet,
    press,
    hovered: onStreet ? hoveredBuilding : undefined,
    focused: onStreet ? street?.focused : undefined,
    selected: onStreet ? selection?.building.record.id : undefined,
    redraw,
    redrawNow,
    repaint,
  })
  // A selected building's evidence, arriving and leaving
  const scene = useSelectionMotion({
    target: selection && {
      building: selection.building,
      rule: selection.rule,
      facade: selection.facade,
    },
    instant: selection?.instant ?? false,
    redraw,
  })
  const mapRoot = useCallback(
    () => parent.current?.closest<HTMLElement>("[data-map]") ?? null,
    []
  )
  liftedRef.current = streetMotion.lifted
  streetHoverRef.current = streetMotion.hover
  const streetNames = useStreetNames({
    camera,
    root: mapRoot,
    shown: onStreet,
    redraw,
  })
  const streetFont = useStreetNameFont(cityArea && capital?.labelChars)
  const placeNames = usePlaceNames({
    camera,
    root: mapRoot,
    shown: capital?.archives.context === true && !onStreet,
    redraw,
  })
  const pixelRatio = usePixelRatio()
  // The buildings in view, told again to a street level that starts after
  // they have loaded (its address is written once the camera rests)
  const streetBuildings = useRef<Array<StreetBuilding>>([])
  const onBuildings = street?.onBuildings
  useEffect(() => {
    onBuildings?.(streetBuildings.current)
  }, [onBuildings])
  const onTilesLoaded = useCallback(
    (tiles: Array<CityTileContent>) => {
      streetMotion.onTilesLoaded()
      streetNames.setTiles(tiles)
      streetBuildings.current = buildingsOf(tiles)
      // How many street tiles are in view, for the tests to follow
      if (parent.current) {
        parent.current.dataset.streetTiles = String(tiles.length)
      }
      streetRef.current?.onBuildings(streetBuildings.current)
    },
    // The callbacks it calls are stable
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [streetMotion.onTilesLoaded, streetNames.setTiles]
  )
  // Leaving the street, its tiles stay those of the area last in view while
  // the overview fades back over them
  const [frozenArea, setFrozenArea] = useState<
    [number, number, number, number] | undefined
  >()
  const [wasOnStreet, setWasOnStreet] = useState(onStreet)
  if (wasOnStreet !== onStreet) {
    setWasOnStreet(onStreet)
    const { camera: shown, size } = camera.state
    const area = shown && areaInView(shown, size)
    setFrozenArea(
      onStreet || !area || !cityArea
        ? undefined
        : [
            Math.max(area.west, cityArea[0]),
            Math.max(area.south, cityArea[1]),
            Math.min(area.east, cityArea[2]),
            Math.min(area.north, cityArea[3]),
          ]
    )
  }
  // The tiles where the camera lands, asked for as it glides in from the
  // overview, so the street is ready when it arrives
  useEffect(() => {
    if (
      !press ||
      press.slug !== undefined ||
      press.building !== undefined ||
      !capital?.archives.city
    ) {
      return
    }
    const landing = camera.destination
    const { size } = camera.state
    if (landing && size.width > 0) {
      prefetchCityTiles({
        slug: capital.slug,
        release,
        viewport: viewportOf(landing, size),
      })
    }
  }, [press, camera, capital, release])
  // Arriving from the overview, the street waits for the camera to land:
  // the tiles of the zooms it glides through are never asked for, only
  // those where it lands (asked for as the glide starts)
  const landed = useMapCamera(camera, ({ camera: shown }) => {
    const destination = camera.destination
    return (
      !shown || !destination || Math.abs(destination.zoom - shown.zoom) < 0.01
    )
  })
  // How far apart the waves of the arrival are: a third of the way from the
  // centre to a corner
  const size = useMapCamera(camera, (state) => state.size)
  const waveSpacing = Math.hypot(size.width, size.height) / 2 / 3

  drawn.current = () => {
    const gliding = streetMotion.reveal.phase === "armed" && !landed
    // The arrival at street level, for the tests to follow
    if (parent.current) {
      parent.current.dataset.streetArrival = streetMotion.reveal.phase
    }
    noteLifted()
    const evidence =
      capital && (scene.shown || scene.veil > 0)
        ? selectionLayers({
            scene,
            colors,
            offset: streetMotion.lifted[3].offset,
            bounds: capital.context.bbox,
            focusedFacade: selection?.focusedFacade,
          })
        : undefined
    deck?.setProps({
      layers: baseLayers({
        colors,
        release,
        city,
        capital,
        gridDrawn: capital !== undefined && gridDrawnFor === capital.slug,
        metresPerPixel,
        roadOpacity,
        onGridDrawn,
        capitals: home && {
          capitals: home.capitals,
          focused: home.focused,
          motion,
          nameFont,
        },
        ring: motion.ring,
        street:
          capital && cityArea && streetMotion.drawn && !gliding
            ? {
                layers: streetLayers({
                  slug: capital.slug,
                  release,
                  colors,
                  extent: frozenArea ?? cityArea,
                  latitude: (cityArea[1] + cityArea[3]) / 2,
                  reveal: streetMotion.reveal,
                  hidden: streetMotion.hidden,
                  lifted: streetMotion.lifted,
                  waveSpacing,
                  onTilesLoaded,
                  selection: evidence,
                }),
                overview: streetMotion.overview,
              }
            : undefined,
        reveal: streetMotion.reveal,
        waveSpacing,
        onContextTilesLoaded: placeNames.setTiles,
        placeNames:
          capital?.archives.context && placeNames.characterSet
            ? placeNamesLayer({
                ...placeNames.current(),
                colors,
                characterSet: placeNames.characterSet,
                pixelRatio,
                opacity: onStreet ? 0 : streetMotion.overview,
              })
            : null,
        // Made as soon as the capital's font is ready, shown at street
        // level only: its shaders are ready before the street arrives
        streetNames:
          cityArea && streetFont
            ? streetNamesLayer({
                labels: onStreet ? streetNames.current().labels : [],
                version: streetNames.current().version,
                colors,
                characterSet: streetFont,
                pixelRatio,
                opacity: onStreet ? streetMotion.names : 0,
              })
            : null,
      }),
    })
  }
  useEffect(redraw, [
    redraw,
    deck,
    colors,
    release,
    city,
    capital,
    gridDrawnFor,
    metresPerPixel,
    roadOpacity,
    home?.capitals,
    home?.focused,
    nameFont,
    streetMotion.lifted,
    streetFont,
    frozenArea,
    waveSpacing,
    onStreet,
    landed,
    placeNames.characterSet,
    selection?.focusedFacade,
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
