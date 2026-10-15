import {
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"

import { desktopQuery } from "@/hooks/use-desktop-layout"
import { cn } from "@/lib/utils"

/**
 * How a page shows the map area:
 * - `shown`: on the right on desktop, as a band in the column on phones;
 * - `hidden`: hidden but still mounted, as on Methodology, whose reading page
 *   takes its place;
 * - `hiddenOnPhone`: kept on desktop, left out of the phone's column, as on
 *   About.
 */
export type MapAreaMode = "shown" | "hidden" | "hiddenOnPhone"

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    mapArea?: MapAreaMode
    /**
     * The part of the page's panel content that comes after the map band on
     * phones (the page's own component is the part before it). On desktop
     * both parts follow each other in the panel.
     */
    afterMapBand?: ComponentType
  }
}

/** Where the map area goes: in the phone's column, or beside the panel */
type Layout = "phone" | "desktop"

/**
 * An empty box in the layout that holds the map area when its layout is
 * active. Both boxes are in the server's HTML, sized and shown by CSS alone,
 * so the page lays out the same before and after the script runs.
 */
export function MapSlot({
  layout,
  mode,
}: {
  layout: Layout
  mode: MapAreaMode
}) {
  return (
    <div
      data-map-slot={layout}
      hidden={
        mode === "hidden" || (layout === "phone" && mode === "hiddenOnPhone")
      }
      className={cn({
        // A band in the column, between the parts of the page's content,
        // fading into the page
        "relative -mx-panel-inset-phone aspect-[960/900] shrink-0 overflow-hidden bg-background desktop:hidden":
          layout === "phone",
        "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-12 after:bg-linear-to-b after:from-transparent after:to-surface":
          layout === "phone",
        // Everything to the right of the panel
        "absolute inset-y-0 right-0 left-panel bg-background max-desktop:hidden":
          layout === "desktop",
      })}
    />
  )
}

// Whether the page runs in the browser, after hydration: false while the
// server renders and while the browser hydrates its HTML
const subscribeToNothing = () => () => {}
function useIsHydrated() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  )
}

// How many map areas this page has made, to tell each one apart
let areasMade = 0

/**
 * The map area: one element, created once in the browser and never recreated,
 * that holds the map. When the window crosses the breakpoint, the element is
 * moved into the other layout's slot; moving a DOM node keeps everything in
 * it, so the map keeps its WebGL context and its tiles. Its React content is
 * rendered into it through a portal, so it stays mounted as well.
 */
export function MapArea({ children }: { children?: ReactNode }) {
  const [area] = useState(() => {
    if (typeof document === "undefined") {
      return null
    }

    const element = document.createElement("div")
    element.className = "absolute inset-0"
    element.dataset.mapArea = ""
    // Set once: it stays the same for as long as the area lives, which the
    // end-to-end tests check. A count, not a random id: `crypto.randomUUID`
    // only exists on secure origins, not on a phone opening the
    // development server by its network address.
    areasMade += 1
    element.dataset.instance = String(areasMade)
    return element
  })
  const isHydrated = useIsHydrated()

  useLayoutEffect(() => {
    if (!area) {
      return
    }

    const query = window.matchMedia(desktopQuery)
    const place = () => {
      const layout: Layout = query.matches ? "desktop" : "phone"
      const slot = document.querySelector(`[data-map-slot="${layout}"]`)
      if (slot && area.parentElement !== slot) {
        slot.append(area)
      }
    }

    place()
    query.addEventListener("change", place)
    return () => query.removeEventListener("change", place)
  }, [area])

  return area && isHydrated ? createPortal(children, area) : null
}
