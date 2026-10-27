import { useQuery } from "@tanstack/react-query"
import { useMatches, useNavigate } from "@tanstack/react-router"
import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react"
import { useLocale, useTranslations } from "use-intl"

import {
  useCapitalHighlight,
  useSetCapitalHighlight,
} from "@/components/home/capital-highlight"
import { CentreMark } from "@/components/map/centre-mark"
import { HoverLabel } from "@/components/map/hover-label"
import { KeyHint } from "@/components/map/key-hint"
import { MapAttribution } from "@/components/map/map-attribution"
import { MapBottom, mapBottomRow } from "@/components/map/map-bottom"
import { MapControls } from "@/components/map/map-controls"
import { MapLegend } from "@/components/map/map-legend"
import { overlayPlacement } from "@/components/map/placement"
import { ScaleBar } from "@/components/map/scale-bar"
import {
  TwoFingerHint,
  useTwoFingerHint,
} from "@/components/map/two-finger-hint"
import {
  capitalsQuery,
  outlineQuery,
  rankingQuery,
  sourcesQuery,
  summaryQuery,
} from "@/data/queries"
import { standInBuilding } from "@/data/stand-in-buildings"
import { prefersReducedMotion } from "@/design/reduced-motion"
import {
  motionDetails,
  motionTokens,
  spacing,
  typeScale,
} from "@/design/tokens"
import { env } from "@/env"
import { useDesktopLayout } from "@/hooks/use-desktop-layout"
import { nameIn } from "@/i18n/names"
import type { Capital, Ranking } from "@/data/schemas"
import type { CapitalSearch } from "@/lib/capital-search"
import { capitalView, guideInput } from "@/lib/capital-view"
import type { CapitalSlug } from "@/lib/capitals"
import { guideState, type GuideState, type MapView } from "@/lib/guide"
import { capitalLegend, drawnLegend, type LegendView } from "@/lib/map-legend"
import { wholePercent } from "@/lib/ranking"
import { cn } from "@/lib/utils"
import {
  mapViewOf,
  parseVisibleArea,
  polygonsArea,
  type VisibleArea,
} from "@/lib/visible-area"
import {
  addressArea,
  areaInView,
  europeArea,
  keyAction,
  metresPerPixel,
  viewportOf,
  zoomLimits,
  zoomRoom,
  type CameraLimits,
  type Padding,
} from "./camera"
import {
  capitalStep,
  homeCapitals,
  type HomeCapital,
  type LngLat,
} from "./home-capitals"
import { GuidePulse, useCityOverview } from "./city-overview"
import { Renderer } from "./load-renderer"
import { MapCamera, useMapCamera, type MapCameraState } from "./map-camera"
import { mapColors, useColorScheme } from "./map-colors"
import type { HomeMap, MapPress } from "./renderer"
import { useStreetLevel } from "./street-level"

/*
 * The map, in the layout every page shares: made once, it stays on screen
 * on Home, a capital and About, and hidden on Methodology, whatever the
 * visitor opens, so it never reloads. Home shows Europe and a capital's page
 * its city; About and Methodology keep what was shown before (Europe when
 * opened directly), as does a missing page with Europe.
 *
 * It is one focus stop, named and described by its key hint, that takes
 * the keys common to every view (the arrow keys pan, + and − zoom). The
 * area in view is kept in the address (`at`) once the visitor's moves
 * settle, and a shared address shows the same area.
 *
 * On Home it shows the 27 capitals. The capital under the pointer shows its
 * label and highlights its ranking row, and a row pointed at lifts its
 * capital. With the keyboard, Tab and Shift+Tab go through the capitals in
 * the order of the ranking, each shown as on hover, then Tab leaves the map;
 * Enter, or a click, opens the capital's page once it has wobbled.
 *
 * On a capital's city overview, a click or a tap anywhere zooms in there to
 * the street, and Enter at the centre of the view, marked by a small cross
 * while the map has the keyboard's focus. The guide's pulse sits on the
 * city's suggested place until the visitor moves the map. At street level,
 * it sits on the building with results nearest to where the map zoomed in,
 * and Tab goes through the buildings with results nearest the centre.
 */

/** The page that sets what the map shows */
type MapPage =
  | { map: "home"; at?: string }
  | { map: "capital"; slug: CapitalSlug; search: CapitalSearch }

/** The page shown, if it is one that sets what the map shows */
function useMapPage(): MapPage | undefined {
  const key = useMatches({
    select: (matches) => {
      const last = matches.at(-1)
      if (!last || last.status === "notFound" || last.routeId === "/$locale") {
        // A missing page shows the map as on Home
        return JSON.stringify({ map: "home" })
      }
      if (last.routeId === "/$locale/") {
        const { at } = last.search as { at?: string }
        return JSON.stringify({ map: "home", at })
      }
      if (last.routeId === "/$locale/capitals/$slug") {
        return JSON.stringify({
          map: "capital",
          slug: (last.params as { slug: string }).slug,
          search: last.search,
        })
      }
      return ""
    },
  })
  return useMemo(() => (key ? (JSON.parse(key) as MapPage) : undefined), [key])
}

const atOf = (page: MapPage) => (page.map === "home" ? page.at : page.search.at)

const placeOf = (page: MapPage) =>
  page.map === "home" ? "home" : `capital:${page.slug}`

/** The least room between a fitted city, or Europe, and what floats over it */
const fitGap = 12

/**
 * Room kept around a whole city, or Europe, when the map fits it, so the
 * whole of it stays clear of what floats over the map, with 12 px to spare:
 * the controls in the top right corner (one row of 44 px on the phone's
 * band, a column on desktop, with the legend in the top left), and the
 * attribution's line at the bottom, which on the band sits above its fade.
 */
const fitPadding: Record<"desktop" | "phone", Padding> = {
  desktop: {
    top: spacing.mapInset + spacing.targetPhone + fitGap,
    right: spacing.mapInset + spacing.targetPhone + fitGap,
    bottom: mapBottomRow.desktop + typeScale.attribution.lineHeight + fitGap,
    left: spacing.mapInset + fitGap,
  },
  phone: {
    top: spacing.mapInset + spacing.targetPhone + fitGap,
    right: spacing.mapInset,
    bottom: mapBottomRow.phone + typeScale.attribution.lineHeight + fitGap,
    left: spacing.mapInset,
  },
}

const bboxArea = ([west, south, east, north]: [
  number,
  number,
  number,
  number,
]): VisibleArea => ({ west, south, east, north })

export function SiteMap() {
  const t = useTranslations("map")
  const locale = useLocale()
  const navigate = useNavigate()
  const desktop = useDesktopLayout()
  const scheme = useColorScheme()
  const colors = useMemo(() => mapColors(scheme), [scheme])
  const [camera] = useState(() => new MapCamera())
  const root = useRef<HTMLDivElement>(null)
  const hintId = useId()

  // What the map shows: the last page that sets it, Europe at first
  const page = useMapPage()
  const [shown, setShown] = useState<MapPage>(page ?? { map: "home" })
  if (page && JSON.stringify(page) !== JSON.stringify(shown)) {
    setShown(page)
  }
  const slug = shown.map === "capital" ? shown.slug : undefined
  const at = atOf(shown)

  const { data: capitals } = useQuery(capitalsQuery())
  const { data: ranking } = useQuery(rankingQuery())
  const { data: sources } = useQuery(sourcesQuery())
  const { data: summary } = useQuery({
    ...summaryQuery(slug ?? "stockholm"),
    enabled: slug !== undefined,
  })
  // The city limits, drawn as soon as they arrive (not part of the page's
  // HTML: Helsinki's are 814 kB)
  const { data: outline, isError: noOutline } = useQuery({
    ...outlineQuery(slug ?? "stockholm"),
    enabled: slug !== undefined,
  })
  const cityOutline = slug && outline?.slug === slug ? outline : undefined
  const city = slug
    ? capitals?.capitals.find((capital) => capital.slug === slug)
    : undefined
  // The whole city: the bounds of its limits, which the camera waits for,
  // or, when the limits cannot be had, the summary's box (the same bounds,
  // rounded outwards)
  const cityArea = useMemo(
    () =>
      cityOutline
        ? polygonsArea(cityOutline.geometry.coordinates)
        : slug && summary && (noOutline || outline === null)
          ? bboxArea(summary.bbox)
          : undefined,
    [cityOutline, slug, summary, noOutline, outline]
  )

  // The map's size, and so whether it is on screen
  useLayoutEffect(() => {
    const element = root.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      camera.setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [camera])
  useEffect(() => () => camera.dispose(), [camera])

  // Where the camera may go: on a capital's page, inside the overview's
  // rectangle, no farther out than its least zoom for the layout, which the
  // camera waits for
  const capitalSummary = slug && summary?.slug === slug ? summary : undefined
  const limitsReady = shown.map === "home" || capitalSummary !== undefined
  const layout = desktop ? "desktop" : "phone"
  const limits = useMemo<CameraLimits>(
    () =>
      capitalSummary
        ? {
            min: capitalSummary.context.min_zoom[layout],
            max: zoomLimits.capital.max,
            bounds: bboxArea(capitalSummary.context.bbox),
          }
        : zoomLimits[shown.map],
    [capitalSummary, layout, shown.map]
  )
  useEffect(() => {
    camera.setLimits(limits)
  }, [camera, limits])

  // The camera fits the page's area: the one in its address, otherwise
  // Europe or the whole city. The map's own writes to the address are left
  // alone, since the camera is already there.
  const written = useRef<string | undefined>(undefined)
  const padding = fitPadding[desktop ? "desktop" : "phone"]
  const paddingRef = useRef(padding)
  paddingRef.current = padding
  const place = placeOf(shown)
  useEffect(() => {
    if (!limitsReady || written.current === `${place}|${at}`) {
      return
    }
    written.current = undefined
    const shared = at === undefined ? undefined : parseVisibleArea(at)
    if (shared) {
      camera.go({ area: shared }, "page")
      return
    }
    if (place === "home") {
      camera.go({ area: europeArea, padding: paddingRef.current }, "page")
    } else if (cityArea) {
      camera.go({ area: cityArea, padding: paddingRef.current }, "page")
    }
    // The city's area is the same for as long as its page is shown
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, place, at, cityArea === undefined, limitsReady])

  // Once the visitor's moves settle, the address keeps the area in view,
  // in place of the last one (no new step in the history). Only on the
  // page that sets the map: About and Methodology have no map state.
  const current = useRef({ page, shown })
  current.current = { page, shown }
  useEffect(() => {
    camera.onSettle = () => {
      const { page: now, shown: drawn } = current.current
      if (!now || JSON.stringify(now) !== JSON.stringify(drawn)) {
        return
      }
      const { camera: shownCamera, size } = camera.state
      const next = shownCamera && addressArea(shownCamera, size)
      if (!next || next === atOf(now)) {
        return
      }
      written.current = `${placeOf(now)}|${next}`
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => ({
          ...previous,
          at: next,
        }),
        replace: true,
        resetScroll: false,
      } as never)
    }
    return () => {
      camera.onSettle = undefined
    }
  }, [camera, navigate])

  const wholeCity = useCallback(() => {
    if (cityArea) {
      camera.go({ area: cityArea, padding: paddingRef.current }, "visitor")
    }
  }, [camera, cityArea])

  // The view, for the key hint, the legend and screen readers
  const capitalViewShown = useMemo(
    () =>
      shown.map === "capital"
        ? capitalView(
            shown.search,
            shown.search.building === undefined
              ? undefined
              : standInBuilding(shown.slug, shown.search.building)
          )
        : undefined,
    [shown]
  )
  const state: GuideState = capitalViewShown
    ? guideState(guideInput(capitalViewShown))
    : "home"
  const announcement = useViewAnnouncement(slug, capitalViewShown?.view)

  // The key hint shows while the map has the keyboard's focus
  const [keyboardFocus, setKeyboardFocus] = useState(false)
  // How the focus last came into the map: Shift+Tab from what follows it
  // goes through the capitals, buildings or facades from the last
  const entered = useRef<"forwards" | "backwards">("forwards")

  // The last press on the map, which sends out a ring: a capital, or a
  // place of the city overview zoomed into
  const [press, setPress] = useState<MapPress>()
  const pressAt = useCallback(
    (pressed: LngLat, capital?: CapitalSlug) =>
      setPress((last) => ({
        id: (last?.id ?? 0) + 1,
        slug: capital,
        at: pressed,
      })),
    []
  )

  const home = useHomeCapitals({
    onHome: shown.map === "home",
    capitals: capitals?.capitals,
    ranking,
    locale,
    onPress: pressAt,
  })

  const overview = useCityOverview({
    camera,
    slug,
    summary: slug && summary?.slug === slug ? summary : undefined,
    onOverview: capitalViewShown?.view === "overview",
    onPress: pressAt,
  })

  const streetLevel = useStreetLevel({
    camera,
    slug,
    onStreet: capitalViewShown?.view === "street",
  })

  const legendView: LegendView = capitalViewShown
    ? drawnLegend(
        capitalLegend(capitalViewShown),
        overview.map?.cityArea !== undefined
      )
    : { view: "home" }

  const twoFingers = useTwoFingers(root, !desktop)
  const visible = useMapCamera(camera, isOnScreen)

  const name = city
    ? t("name.capital", {
        capital: nameIn(city.name, locale),
        view: capitalViewShown?.view ?? "overview",
      })
    : t("name.home")

  return (
    <div
      ref={root}
      data-map={shown.map}
      className="absolute inset-0 overflow-hidden"
    >
      {/* The map's one focus stop: it takes the keys, and holds the canvas
          so the pointer reaches it */}
      {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="application"
        aria-label={name}
        aria-describedby={hintId}
        tabIndex={0}
        onKeyDown={(event) => {
          // Only the first key after entering the map knows how it came in;
          // Shift alone, pressed before Tab, is not a key of its own
          const fromEnd = entered.current === "backwards"
          if (!["Shift", "Control", "Alt", "Meta"].includes(event.key)) {
            entered.current = "forwards"
          }
          if (
            home.onKey(event, fromEnd) ||
            overview.onKey(event) ||
            streetLevel.onKey(event, fromEnd)
          ) {
            event.preventDefault()
            return
          }
          const action = keyAction(event)
          if (action) {
            event.preventDefault()
            camera.act(action)
          }
        }}
        onFocus={(event) => {
          setKeyboardFocus(event.currentTarget.matches(":focus-visible"))
          // Entering the map: backwards from what follows it (Shift+Tab), or
          // forwards (Tab, a click on the map, focus from nowhere)
          const from = event.relatedTarget
          const map = event.currentTarget
          if (
            from instanceof Node &&
            !map.contains(from) &&
            event.target === map &&
            map.compareDocumentPosition(from) & Node.DOCUMENT_POSITION_FOLLOWING
          ) {
            entered.current = "backwards"
          }
        }}
        onBlur={() => {
          setKeyboardFocus(false)
          entered.current = "forwards"
          home.blur()
          streetLevel.blur()
        }}
        {...twoFingers.handlers}
        className="absolute inset-0 -outline-offset-2 desktop:touch-none"
      >
        <Suspense fallback={null}>
          <Renderer
            camera={camera}
            colors={colors}
            release={env.VITE_DATA_RELEASE}
            home={home.map}
            press={press}
            city={cityOutline}
            capital={overview.map}
            street={streetLevel.street}
            oneFingerScrolls={!desktop}
            visible={visible}
          />
        </Suspense>
      </div>
      {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */}
      {/* On phones, the legend is under the map band instead */}
      <MapLegend
        view={legendView}
        className={cn(overlayPlacement.legend, "max-desktop:hidden")}
      />
      <ZoomControls
        camera={camera}
        onWholeCity={cityArea ? wholeCity : undefined}
      />
      <MapBottom
        attribution={
          <MapAttribution map={shown.map} sources={sources?.sources ?? []} />
        }
        scale={shown.map === "capital" && <CameraScale camera={camera} />}
        keyHint={<KeyHint id={hintId} state={state} visible={keyboardFocus} />}
      />
      <CapitalLabel camera={camera} capital={home.labelled} />
      <GuidePulse camera={camera} pulse={overview.pulse} state="overview" />
      <GuidePulse camera={camera} pulse={streetLevel.pulse} state="street" />
      <CentreMark
        visible={keyboardFocus && overview.map?.onPress !== undefined}
      />
      <div className={overlayPlacement.twoFingerHint}>
        <TwoFingerHint visible={twoFingers.visible} />
      </div>
      {/* A live region, said politely, as the view changes or a capital is
          pointed at */}
      <output className="sr-only">
        {shown.map === "home"
          ? home.announcement
          : streetLevel.announcement || announcement}
      </output>
    </div>
  )
}

const isOnScreen = ({ size }: MapCameraState) =>
  size.width > 0 && size.height > 0

/**
 * The capitals of the Home map and what the visitor does with them: the one
 * under the pointer, the one in keyboard focus (Tab and Shift+Tab, in the
 * order of the ranking, then out of the map), the row pointed at in the
 * ranking, and a capital opened (it wobbles and sends out a ring, then its
 * page opens; at once under reduced motion)
 */
function useHomeCapitals({
  onHome,
  capitals,
  ranking,
  locale,
  onPress,
}: {
  onHome: boolean
  capitals: Array<Capital> | undefined
  ranking: Ranking | null | undefined
  locale: string
  /** A capital pressed, which wobbles and sends out a ring */
  onPress: (at: LngLat, slug: CapitalSlug) => void
}) {
  const t = useTranslations("map.announce")
  const navigate = useNavigate()
  const shownCapitals = useMemo(
    () => (capitals ? homeCapitals(capitals, ranking, locale) : undefined),
    [capitals, ranking, locale]
  )

  const [pointed, setPointed] = useState<CapitalSlug>()
  const [focused, setFocused] = useState<CapitalSlug>()
  // Nothing is pointed at once the map leaves Home
  const [wasOnHome, setWasOnHome] = useState(onHome)
  if (wasOnHome !== onHome) {
    setWasOnHome(onHome)
    setPointed(undefined)
    setFocused(undefined)
  }

  // The map and the ranking highlight each other's capital
  const mapPoints = onHome ? (focused ?? pointed) : undefined
  const rowPoints = useCapitalHighlight("list")
  const setHighlight = useSetCapitalHighlight()
  useEffect(() => {
    setHighlight({ map: mapPoints })
  }, [mapPoints, setHighlight])
  useEffect(() => () => setHighlight({ map: undefined }), [setHighlight])

  // A capital opened: its page opens once its wobble is over
  const opening = useRef<ReturnType<typeof setTimeout>>(undefined)
  const open = useCallback(
    (slug: CapitalSlug, at: LngLat) => {
      if (opening.current !== undefined) {
        return
      }
      onPress(at, slug)
      opening.current = setTimeout(
        () => {
          opening.current = undefined
          void navigate({
            to: "/$locale/capitals/$slug",
            params: { locale, slug },
          })
        },
        prefersReducedMotion() ? 0 : motionTokens.squash.duration
      )
    },
    [navigate, locale, onPress]
  )
  useEffect(() => () => clearTimeout(opening.current), [])

  const map = useMemo<HomeMap | undefined>(
    () =>
      onHome && shownCapitals
        ? {
            capitals: shownCapitals,
            lifted: mapPoints ?? rowPoints,
            focused,
            onHover: setPointed,
            onPress: open,
          }
        : undefined,
    [onHome, shownCapitals, mapPoints, rowPoints, focused, open]
  )

  const labelled = shownCapitals?.find(({ slug }) => slug === mapPoints)

  return {
    map,
    labelled,
    // What screen readers hear of the capital pointed at
    announcement:
      labelled && labelled.share !== undefined
        ? t("capital", {
            capital: labelled.name,
            country: labelled.country,
            rank: labelled.rank,
            count: shownCapitals?.length ?? 0,
            share: wholePercent(labelled.share) / 100,
          })
        : "",
    /**
     * Takes Tab and Enter among the capitals; true when it took the key.
     * `fromEnd`: the map was just entered backwards.
     */
    onKey: (event: KeyboardEvent<HTMLElement>, fromEnd: boolean) => {
      if (!map || event.altKey || event.ctrlKey || event.metaKey) {
        return false
      }
      if (event.key === "Tab") {
        const order = map.capitals.map(({ slug }) => slug)
        const step = capitalStep(order, focused, event.shiftKey, fromEnd)
        if (step.leaves) {
          return false
        }
        setFocused(step.next)
        return true
      }
      const capital = map.capitals.find(({ slug }) => slug === focused)
      if (event.key === "Enter" && capital) {
        open(capital.slug, capital.display)
        return true
      }
      return false
    },
    /** The map lost the focus: no capital is in focus any more */
    blur: () => setFocused(undefined),
  }
}

/**
 * The label of the capital pointed at on the map, 12 px above its lifted
 * outline (or below it, near the top of the map), following the camera
 */
function CapitalLabel({
  camera,
  capital,
}: {
  camera: MapCamera
  capital: HomeCapital | undefined
}) {
  // Where it is on screen, and the map's size, to the half pixel
  const placed = useMapCamera(camera, ({ camera: shown, size }) => {
    if (!capital || !shown) {
      return ""
    }
    const viewport = viewportOf(shown, size)
    const [x, top] = viewport.project(capital.top)
    const [, bottom] = viewport.project(capital.bottom)
    const half = (value: number) => Math.round(value * 2) / 2
    return [
      half(x),
      half(top - motionDetails.liftMap),
      half(bottom - motionDetails.liftMap),
      size.width,
      size.height,
    ].join()
  })
  const [x, y, bottom, width, height] = placed
    ? placed.split(",").map(Number)
    : []

  return (
    <HoverLabel
      capital={
        capital && placed && capital.share !== undefined
          ? {
              name: capital.name,
              country: capital.country,
              share: capital.share,
            }
          : undefined
      }
      x={x ?? 0}
      y={y ?? 0}
      bottom={bottom}
      map={{ width: width ?? 0, height: height ?? 0 }}
    />
  )
}

/** Zoom in and out, and "Whole city" on a capital's page */
function ZoomControls({
  camera,
  onWholeCity,
}: {
  camera: MapCamera
  onWholeCity: (() => void) | undefined
}) {
  const canZoomIn = useMapCamera(
    camera,
    (state) => !state.camera || zoomRoom(state.camera, state.limits).canZoomIn
  )
  const canZoomOut = useMapCamera(
    camera,
    (state) => !state.camera || zoomRoom(state.camera, state.limits).canZoomOut
  )

  return (
    <MapControls
      className={overlayPlacement.controls}
      onZoomIn={() => camera.act({ kind: "zoom", by: 1 })}
      onZoomOut={() => camera.act({ kind: "zoom", by: -1 })}
      canZoomIn={canZoomIn}
      canZoomOut={canZoomOut}
      onWholeCity={onWholeCity}
    />
  )
}

/** The scale, at street level: the area in view narrower than 1.5 km */
function CameraScale({ camera }: { camera: MapCamera }) {
  const metres = useMapCamera(camera, ({ camera: shown, size }) =>
    shown && mapViewOf(areaInView(shown, size)) === "street"
      ? metresPerPixel(shown, size)
      : undefined
  )
  return metres === undefined ? null : <ScaleBar metresPerPixel={metres} />
}

/**
 * What screen readers hear when the capital's map reaches another view
 * (the city overview, the street), politely and once per change. Nothing is
 * said as a page opens: the page's name is announced then.
 */
function useViewAnnouncement(
  slug: CapitalSlug | undefined,
  view: MapView | "building" | undefined
) {
  const t = useTranslations("map.announce")
  const [message, setMessage] = useState("")
  const last = useRef({ slug, view })

  useEffect(() => {
    const before = last.current
    last.current = { slug, view }
    if (
      slug !== undefined &&
      slug === before.slug &&
      view !== before.view &&
      (view === "overview" || view === "street")
    ) {
      setMessage(t(view))
    } else if (slug !== before.slug) {
      setMessage("")
    }
  }, [slug, view, t])

  return message
}

/** How far one finger goes sideways before the hint shows, in pixels */
const sidewaysDrag = 12

/**
 * On the phone's map band, one finger scrolls the page and two move the
 * map. A one-finger drag sideways (which neither scrolls the page nor moves
 * the map) shows the "Use two fingers" hint; two fingers keep the page from
 * scrolling while they move the map.
 */
function useTwoFingers(root: RefObject<HTMLDivElement | null>, band: boolean) {
  const hint = useTwoFingerHint()
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const shown = useRef(false)

  useEffect(() => {
    const element = root.current
    if (!element || !band) {
      return
    }
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 1 && event.cancelable) {
        event.preventDefault()
      }
    }
    element.addEventListener("touchmove", onTouchMove, { passive: false })
    return () => element.removeEventListener("touchmove", onTouchMove)
  }, [root, band])

  const forget = (event: PointerEvent) => {
    touches.current.delete(event.pointerId)
  }

  return {
    visible: hint.visible,
    handlers: {
      onPointerDown: (event: PointerEvent) => {
        if (event.pointerType !== "touch") {
          return
        }
        // The first finger starts a new touch
        if (event.isPrimary) {
          touches.current.clear()
          shown.current = false
        }
        touches.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        })
      },
      onPointerMove: (event: PointerEvent) => {
        const start = touches.current.get(event.pointerId)
        if (!band || !start || touches.current.size !== 1 || shown.current) {
          return
        }
        const dx = Math.abs(event.clientX - start.x)
        const dy = Math.abs(event.clientY - start.y)
        if (dx > sidewaysDrag && dx > dy) {
          shown.current = true
          hint.show()
        }
      },
      onPointerUp: forget,
      onPointerCancel: forget,
    },
  }
}
