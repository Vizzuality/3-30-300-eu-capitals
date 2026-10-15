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
  type PointerEvent,
  type RefObject,
} from "react"
import { useLocale, useTranslations } from "use-intl"

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
import { capitalsQuery, sourcesQuery, summaryQuery } from "@/data/queries"
import { standInBuilding } from "@/data/stand-in-buildings"
import { spacing, typeScale } from "@/design/tokens"
import { useDesktopLayout } from "@/hooks/use-desktop-layout"
import { nameIn } from "@/i18n/names"
import type { CapitalSearch } from "@/lib/capital-search"
import { capitalView, guideInput } from "@/lib/capital-view"
import type { CapitalSlug } from "@/lib/capitals"
import { guideState, type GuideState, type MapView } from "@/lib/guide"
import type { LegendView } from "@/lib/map-legend"
import {
  mapViewOf,
  parseVisibleArea,
  type VisibleArea,
} from "@/lib/visible-area"
import {
  addressArea,
  areaInView,
  europeArea,
  keyAction,
  metresPerPixel,
  zoomLimits,
  zoomRoom,
  type Padding,
} from "./camera"
import { Renderer } from "./load-renderer"
import { MapCamera, useMapCamera, type MapCameraState } from "./map-camera"
import { mapColors, useColorScheme } from "./map-colors"

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

/** The views the map draws so far; the others arrive with the next steps */
const drawnViews: ReadonlySet<LegendView["view"]> = new Set(["home"])

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
  const { data: sources } = useQuery(sourcesQuery())
  const { data: summary } = useQuery({
    ...summaryQuery(slug ?? "stockholm"),
    enabled: slug !== undefined,
  })
  const city = slug
    ? capitals?.capitals.find((capital) => capital.slug === slug)
    : undefined
  const cityArea = slug && summary ? bboxArea(summary.bbox) : undefined

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

  useEffect(() => {
    camera.setLimits(zoomLimits[shown.map])
  }, [camera, shown.map])

  // The camera fits the page's area: the one in its address, otherwise
  // Europe or the whole city. The map's own writes to the address are left
  // alone, since the camera is already there.
  const written = useRef<string | undefined>(undefined)
  const padding = fitPadding[desktop ? "desktop" : "phone"]
  const paddingRef = useRef(padding)
  paddingRef.current = padding
  const place = placeOf(shown)
  useEffect(() => {
    if (written.current === `${place}|${at}`) {
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
      camera.go(
        { area: cityArea, padding: paddingRef.current, whole: true },
        "page"
      )
    }
    // The city's area is the same for as long as its page is shown
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, place, at, cityArea === undefined])

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
      camera.go(
        { area: cityArea, padding: paddingRef.current, whole: true },
        "visitor"
      )
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
  const legendView: LegendView = capitalViewShown
    ? capitalViewShown.view === "building"
      ? {
          view: "building",
          rule: capitalViewShown.rule,
          facade: capitalViewShown.facade !== undefined,
        }
      : { view: capitalViewShown.view }
    : { view: "home" }
  const announcement = useViewAnnouncement(slug, capitalViewShown?.view)

  // The key hint shows while the map has the keyboard's focus
  const [keyboardFocus, setKeyboardFocus] = useState(false)

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
          const action = keyAction(event)
          if (action) {
            event.preventDefault()
            camera.act(action)
          }
        }}
        onFocus={(event) =>
          setKeyboardFocus(event.currentTarget.matches(":focus-visible"))
        }
        onBlur={() => setKeyboardFocus(false)}
        {...twoFingers.handlers}
        className="absolute inset-0 -outline-offset-2 desktop:touch-none"
      >
        <Suspense fallback={null}>
          <Renderer
            camera={camera}
            colors={colors}
            city={city}
            oneFingerScrolls={!desktop}
            visible={visible}
          />
        </Suspense>
      </div>
      {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */}
      <MapLegend
        view={drawnViews.has(legendView.view) ? legendView : { view: "home" }}
        className={overlayPlacement.legend}
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
      <div className={overlayPlacement.twoFingerHint}>
        <TwoFingerHint visible={twoFingers.visible} />
      </div>
      {/* A live region, said politely, as the view changes */}
      <output className="sr-only">{announcement}</output>
    </div>
  )
}

const isOnScreen = ({ size }: MapCameraState) =>
  size.width > 0 && size.height > 0

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
