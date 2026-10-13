import { useRouter } from "@tanstack/react-router"
import {
  AnimatePresence,
  animate,
  usePresence,
  type AnimationPlaybackControls,
} from "motion/react"
import {
  createContext,
  use,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { toReducedFade, transitions } from "@/design/tokens-motion"
import { motionDetails, motionTokens } from "@/design/tokens"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { isLanguageSwitch, pageName, resetFocus } from "@/lib/navigation"
import { cn } from "@/lib/utils"

/*
 * The panel's content change: when the page changes, the leaving content
 * fades out in 160 ms, then the new content floats up 8 px into place, in up
 * to three parts 50 ms apart (Float). Under reduced motion both are plain
 * fades. Only the page's content changes: the top bar, the footer and the map
 * area stay as they are.
 *
 * The leaving content cannot be rendered by React while it fades out: the
 * router's `<Outlet />` reads the router's current state, so once the address
 * changes it renders the new page, and the leaving page's own hooks no longer
 * find their route. So a copy of its HTML is taken just before the router
 * changes page (its `onBeforeNavigate` event), and that inert copy is what
 * fades out, in the same place, while the new page waits in the same cell
 * without taking room. `AnimatePresence` keeps each leaving part until its
 * copy has faded.
 *
 * When the new page has arrived, focus goes back to the start of the
 * document and the page's name is announced, as after a full page load
 * (see `resetFocus`), unless only the language changed or the visitor was on
 * the map.
 *
 * The router scrolls the new page to its top (or back to where it was left)
 * as soon as it has rendered, which would move the leaving copy too, while it
 * fades out. So while there is a copy, the scroll is kept where the visitor
 * left it, and the router's scroll is applied once the copy has gone.
 */

/** Where the page and the router's scrolling elements are scrolled to */
type ScrollPositions = { window: number; elements: Array<[Element, number]> }

/** The scrolling elements the router resets, besides the window */
function scrollingElements(selectors: ReadonlyArray<unknown> | undefined) {
  return (selectors ?? [])
    .map((selector) =>
      typeof selector === "string"
        ? document.querySelector(selector)
        : typeof selector === "function"
          ? (selector as () => Element | null | undefined)()
          : null
    )
    .filter((element): element is Element => element != null)
}

function readScroll(elements: Array<Element>): ScrollPositions {
  return {
    window: window.scrollY,
    elements: elements.map((element) => [element, element.scrollTop]),
  }
}

function writeScroll({ window: top, elements }: ScrollPositions) {
  window.scrollTo({ top, behavior: "instant" })
  for (const [element, scrollTop] of elements) {
    element.scrollTop = scrollTop
  }
}

/** The parts of a page's content: before the map band on phones, and after */
export type PanelPartName = "before" | "after"

type Copy = {
  nodes: Array<Node>
  // Scroll offsets of the scrolling elements in the copy, restored once it
  // is in the page (copies always start at the top)
  scrolled: Array<[Element, number, number]>
}

type Snapshot = { from: string; parts: Partial<Record<PanelPartName, Copy>> }

type PanelContext = {
  // Whether a page has been left since the site loaded: the first page is
  // shown as rendered, with no arrival
  navigated: boolean
  // Each visit of a page, even of a page just left: the key of its parts
  visit: string
  // Whether the new page waits for the leaving content to fade out: it then
  // takes no room, so that what follows it does not move
  waiting: boolean
  register: (part: PanelPartName, key: string, element: HTMLElement) => void
  takeCopy: (part: PanelPartName, key: string) => Copy | undefined
  isLeaving: (key: string) => boolean
  // How many parts float in before this one's first (the content after the
  // band continues the content before it)
  partsBefore: (part: PanelPartName) => number
  onPartLeft: () => void
}

const Context = createContext<PanelContext | null>(null)

/** A copy of an element's content, shown inert while it fades out */
function copyContent(element: HTMLElement): Copy {
  const scrolled: Copy["scrolled"] = []
  const nodes = [...element.childNodes].map((node) => {
    const copy = node.cloneNode(true)
    if (node instanceof Element && copy instanceof Element) {
      const originals = [node, ...node.querySelectorAll("*")]
      const copies = [copy, ...copy.querySelectorAll("*")]
      originals.forEach((original, index) => {
        const target = copies[index]
        // Ids and scroll positions belong to the page that stays
        target.removeAttribute("id")
        target.removeAttribute("data-scroll-restoration-id")
        if (original.scrollTop || original.scrollLeft) {
          scrolled.push([target, original.scrollTop, original.scrollLeft])
        }
      })
    }
    return copy
  })
  return { nodes, scrolled }
}

/**
 * Runs the panel's content change for the page shown at `pageKey` (its
 * address), and gives `children` the map area's mode to show (the leaving
 * page's until its content has faded out, so the map band does not move
 * under it) and the announcement of the page that arrived.
 */
export function PanelTransition<Mode>({
  pageKey,
  mapArea,
  children,
}: {
  pageKey: string
  mapArea: Mode
  children: (state: { mapArea: Mode; announcement: string }) => ReactNode
}) {
  const router = useRouter()
  const parts = useRef(
    new Map<PanelPartName, { key: string; element: HTMLElement }>()
  )
  const snapshot = useRef<Snapshot | undefined>(undefined)
  // Whether the visitor was on the map when the page changed, and whether
  // only the language changed: focus then stays where it is
  const focusOnMap = useRef(false)
  const change = useRef({ languageOnly: false, fromMap: false })
  const [announcement, setAnnouncement] = useState("")
  // Where the visitor left the page, and where the router then scrolled the
  // new one, applied once the leaving copy has gone
  const leftAt = useRef<ScrollPositions | undefined>(undefined)
  const scrollTo = useRef<ScrollPositions | undefined>(undefined)
  const announceTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Whether the leaving content is fading out, for callbacks and for render
  const leaving = useRef(false)
  const [isLeaving, setIsLeaving] = useState(false)

  // The first page is shown as rendered; every page after it arrives
  const [firstKey] = useState(pageKey)
  const [hasNavigated, setHasNavigated] = useState(false)
  if (!hasNavigated && pageKey !== firstKey) {
    setHasNavigated(true)
  }
  const navigated = hasNavigated || pageKey !== firstKey

  // Counts the pages shown. Coming back to a page whose content is still
  // fading out is a new visit: its parts are new, while the leaving copy
  // goes on fading, rather than the leaving part being brought back with the
  // copy inside it
  const [visits, setVisits] = useState({ pageKey, count: 0 })
  if (visits.pageKey !== pageKey) {
    setVisits({ pageKey, count: visits.count + 1 })
  }
  const visit = `${visits.count}:${pageKey}`

  const [shownMapArea, setShownMapArea] = useState(mapArea)
  const latestMapArea = useRef(mapArea)
  useLayoutEffect(() => {
    latestMapArea.current = mapArea
  }, [mapArea])

  // Copy each part's content before the router changes page
  useLayoutEffect(
    () =>
      router.subscribe("onBeforeNavigate", (event) => {
        if (!event.pathChanged) {
          return
        }
        focusOnMap.current =
          document.activeElement?.closest("[data-map-area]") != null
        const copies: Snapshot["parts"] = {}
        for (const [name, part] of parts.current) {
          copies[name] = copyContent(part.element)
        }
        snapshot.current = {
          from: parts.current.get("before")?.key ?? "",
          parts: copies,
        }
        leftAt.current = readScroll(
          scrollingElements(router.options.scrollToTopSelectors)
        )
      }),
    [router]
  )

  // The router has just scrolled the new page (its listener comes first):
  // while the copy fades out, it stays where the visitor left it
  useLayoutEffect(
    () =>
      router.subscribe("onRendered", () => {
        const left = leftAt.current
        leftAt.current = undefined
        if (!left) {
          return
        }
        queueMicrotask(() => {
          if (!leaving.current) {
            return
          }
          scrollTo.current = readScroll(
            left.elements.map(([element]) => element)
          )
          writeScroll(left)
        })
      }),
    [router]
  )

  const arrive = useCallback(() => {
    leaving.current = false
    setIsLeaving(false)
    setShownMapArea(latestMapArea.current)
    if (scrollTo.current) {
      writeScroll(scrollTo.current)
      scrollTo.current = undefined
    }

    const { languageOnly, fromMap } = change.current
    if (languageOnly) {
      return
    }
    if (!fromMap) {
      resetFocus()
    }
    // Emptied first, so the same name is announced again; read a moment
    // later, once the router has set the new page's title
    setAnnouncement("")
    clearTimeout(announceTimer.current)
    announceTimer.current = setTimeout(() => setAnnouncement(pageName()), 100)
  }, [])

  useLayoutEffect(() => () => clearTimeout(announceTimer.current), [])

  // Once the parts have taken their copies, the new page arrives: at once,
  // or when the leaving content has faded out
  const lastKey = useRef(pageKey)
  useLayoutEffect(() => {
    if (pageKey === lastKey.current) {
      if (!leaving.current) {
        setShownMapArea(mapArea)
      }
      return
    }
    change.current = {
      languageOnly: isLanguageSwitch(lastKey.current, pageKey),
      fromMap: focusOnMap.current,
    }
    focusOnMap.current = false
    lastKey.current = pageKey
    const hasLeavingContent =
      snapshot.current !== undefined && snapshot.current.from !== pageKey
    snapshot.current = undefined
    if (hasLeavingContent) {
      leaving.current = true
      setIsLeaving(true)
    } else {
      arrive()
    }
  }, [pageKey, mapArea, arrive])

  const context = useMemo<PanelContext>(
    () => ({
      navigated,
      visit,
      waiting: isLeaving,
      register: (part, key, element) => {
        parts.current.set(part, { key, element })
      },
      takeCopy: (part, key) =>
        snapshot.current?.from === key
          ? snapshot.current.parts[part]
          : undefined,
      isLeaving: (key) =>
        snapshot.current !== undefined && snapshot.current.from !== key,
      partsBefore: (part) =>
        part === "after"
          ? (parts.current.get("before")?.element.children.length ?? 0)
          : 0,
      onPartLeft: () => {
        if (leaving.current) {
          arrive()
        }
      },
    }),
    [navigated, visit, isLeaving, arrive]
  )

  return (
    <Context value={context}>
      {children({ mapArea: shownMapArea, announcement })}
    </Context>
  )
}

/** One part of the page's content, changed with the page */
export function PanelPart({
  name,
  pageKey,
  className,
  children,
}: {
  name: PanelPartName
  pageKey: string
  className?: string
  children?: ReactNode
}) {
  const panel = use(Context)

  return (
    <div
      className={cn(
        // The leaving copy and the new content share one cell, so the copy
        // fades out where the content was; the part is left out of the
        // layout while it has nothing to show
        "grid grid-cols-1 [&:not(:has(>:not(:empty)))]:hidden",
        className
      )}
    >
      {/*
       * No `initial={false}` here: the first page's arrival is decided by
       * `PanelPage` itself, and Motion would pass that setting down to every
       * animation inside the page, for as long as it stays, so they would
       * jump to their end (the guide's nudge would never play)
       */}
      <AnimatePresence onExitComplete={panel?.onPartLeft}>
        <PanelPage key={panel?.visit ?? pageKey} name={name} pageKey={pageKey}>
          {children}
        </PanelPage>
      </AnimatePresence>
    </div>
  )
}

const floatExit = {
  type: "tween",
  duration: motionDetails.floatExit.duration / 1000,
  ease: [...motionDetails.floatExit.curve],
} as const

function PanelPage({
  name,
  pageKey,
  children,
}: {
  name: PanelPartName
  pageKey: string
  children?: ReactNode
}) {
  const panel = use(Context)
  const waiting = panel?.waiting ?? false
  const [isPresent, safeToRemove] = usePresence()
  const reduced = usePrefersReducedMotion()
  const ref = useRef<HTMLDivElement>(null)

  // Read by the animations, which start once and must not restart when the
  // page re-renders
  const latest = useRef({ panel, reduced })
  useLayoutEffect(() => {
    latest.current = { panel, reduced }
  }, [panel, reduced])

  useLayoutEffect(() => {
    if (isPresent && ref.current) {
      panel?.register(name, pageKey, ref.current)
    }
  }, [panel, isPresent, name, pageKey])

  // Arriving: the parts wait for the leaving content to fade out, then float
  // up into place one after the other. What it waits for is decided once,
  // so that running the effect again replays the same arrival.
  const [arriving] = useState(panel?.navigated ?? false)
  const arrival = useRef<{ delay: number; firstPart: number }>(undefined)
  useLayoutEffect(() => {
    const element = ref.current
    if (!arriving || !element) {
      return
    }
    const { panel: context, reduced: isReduced } = latest.current
    const planned = arrival.current ?? {
      delay: context?.isLeaving(pageKey) ? motionDetails.floatExit.duration : 0,
      firstPart: context?.partsBefore(name) ?? 0,
    }
    arrival.current = planned
    const controls = floatIn(element, { ...planned, reduced: isReduced })
    return () => controls?.stop()
  }, [arriving, name, pageKey])

  // Leaving: the copy of the content fades out in its place
  const copy = useRef<Copy | undefined>(undefined)
  useLayoutEffect(() => {
    const element = ref.current
    if (isPresent || !element) {
      return
    }
    const taken = copy.current ??
      latest.current.panel?.takeCopy(name, pageKey) ?? {
        nodes: [],
        scrolled: [],
      }
    copy.current = taken
    const { nodes, scrolled } = taken
    if (nodes.length === 0) {
      safeToRemove()
      return
    }
    element.replaceChildren(...nodes)
    for (const [target, top, left] of scrolled) {
      target.scrollTop = top
      target.scrollLeft = left
    }
    const controls = animate(
      element,
      { opacity: 0 },
      latest.current.reduced
        ? toReducedFade(motionDetails.floatExit.duration)
        : floatExit
    )
    void controls.then(() => safeToRemove())
    return () => controls.stop()
  }, [isPresent, safeToRemove, name, pageKey])

  return (
    <div
      ref={ref}
      inert={!isPresent}
      aria-hidden={isPresent ? undefined : true}
      className={cn({
        "col-start-1 row-start-1 flex min-w-0 flex-col gap-block": true,
        "pointer-events-none": !isPresent,
        "h-0": isPresent && waiting,
      })}
    >
      {isPresent ? children : null}
    </div>
  )
}

/**
 * Floats the children of `element` (the parts of the content) up into place,
 * one after the other, after `delay` milliseconds. Under reduced motion they
 * fade in together, without moving.
 */
export function floatIn(
  element: HTMLElement,
  {
    delay,
    firstPart,
    reduced,
  }: { delay: number; firstPart: number; reduced: boolean }
): AnimationPlaybackControls | undefined {
  const parts = [...element.children] as Array<HTMLElement>
  if (parts.length === 0) {
    return undefined
  }

  // Hidden until their turn comes
  for (const part of parts) {
    part.style.opacity = "0"
    if (!reduced) {
      part.style.transform = `translateY(${motionDetails.floatRise}px)`
    }
  }

  if (reduced) {
    return animate(
      parts,
      { opacity: [0, 1] },
      { ...toReducedFade(motionTokens.float.duration), delay: delay / 1000 }
    )
  }

  const lastPart = motionDetails.floatParts - 1
  return animate(
    parts,
    { opacity: [0, 1], y: [motionDetails.floatRise, 0] },
    {
      ...transitions.float,
      delay: (index) =>
        (delay +
          Math.min(firstPart + index, lastPart) * motionDetails.floatApart) /
        1000,
    }
  )
}
