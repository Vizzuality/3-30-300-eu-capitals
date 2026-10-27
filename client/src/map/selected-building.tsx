import { useNavigate } from "@tanstack/react-router"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import { useTranslations } from "use-intl"

import {
  closestWidth,
  evidenceArea,
  fitsEvidence,
  keyboardFacades,
  type BuildingSelection,
} from "@/lib/building-evidence"
import { selectedBuilding } from "@/lib/building"
import type { CapitalSearch } from "@/lib/capital-search"
import type { CapitalSlug } from "@/lib/capitals"
import { rules, type Rule } from "@/lib/rules"
import { groundWidth, streetLevelWidth } from "@/lib/visible-area"
import {
  areaInView,
  fitArea,
  streetCamera,
  viewportOf,
  type Padding,
} from "./camera"
import { capitalStep } from "./home-capitals"
import type { MapCamera } from "./map-camera"
import type { SelectionMap } from "./renderer"

/*
 * A selected building, around the map: the camera fitting its evidence,
 * the keyboard and what screen readers hear.
 *
 * Selecting a building, or choosing another rule, glides the camera until
 * the building and the rule's evidence fill the view: always for the 500 m
 * circle and the walk to a park, and for the trees when the building is
 * partly out of view or too small to read its facades. A building opened
 * with the page keeps the area of its address.
 *
 * The left and right arrows switch rules, as the switcher does; up and down
 * still pan. With the 3 trees rule, Tab and Shift+Tab go through every
 * facade the pointer can click, passing or not, around the building, then
 * Tab leaves the map; Enter selects the facade in focus, as a click does,
 * and again goes back to the whole building. Escape closes the building,
 * the focus kept on the map.
 */

/** Room kept around the evidence, beyond what floats over the map, in pixels */
const evidenceRoom = 24

/** Changes the page's address, as the switcher does: a step in the history */
function useSelectionNavigate() {
  const navigate = useNavigate()
  return useCallback(
    (change: Partial<Pick<CapitalSearch, "rule" | "facade" | "building">>) =>
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => ({
          ...previous,
          ...change,
        }),
        resetScroll: false,
      } as never),
    [navigate]
  )
}

export function useSelectedBuildingMap({
  camera,
  slug,
  search,
  selection,
  padding,
}: {
  camera: MapCamera
  slug: CapitalSlug | undefined
  /** The capital page's address, when a capital is shown */
  search: CapitalSearch | undefined
  /** The building its address names, once read from the tiles */
  selection: BuildingSelection | null | undefined
  /** Room kept around a fitted area, clear of the map's overlays */
  padding: Padding
}) {
  const t = useTranslations("map.announce")
  const go = useSelectionNavigate()
  const building =
    selection && search?.building === selection.record.id
      ? selection
      : undefined
  const id = building?.record.id
  const rule = search?.rule ?? 3
  const facade = rule === 3 ? search?.facade : undefined
  const facades = useMemo(
    () => (building ? keyboardFacades(building) : []),
    [building]
  )

  // A building opened with the page is there at once, with the area of its
  // address; one selected afterwards arrives, and the camera fits it
  const opened = useRef<{ slug?: CapitalSlug; key?: string }>({})
  const key = id === undefined ? undefined : `${id}|${rule}`
  if (opened.current.slug !== slug) {
    opened.current = {
      slug,
      key: search?.building === undefined ? "" : undefined,
    }
  }
  if (opened.current.key === undefined && key !== undefined) {
    opened.current.key = key
  }
  const instant = key !== undefined && opened.current.key === key
  // Once the visitor has moved on, nothing is "opened with the page" any more
  useEffect(() => {
    if (key !== opened.current.key) {
      opened.current.key = ""
    }
  }, [key])

  // The camera fits the evidence of each building and rule selected
  const paddingRef = useRef(padding)
  paddingRef.current = padding
  /** The width of the view the last fit chose, in metres */
  const fitWidth = useRef(0)
  const fitted = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!building || key === undefined || fitted.current === key) {
      return
    }
    fitted.current = key
    const { camera: view, size } = camera.state
    if (!view || size.width <= 0) {
      return
    }
    const room = paddingRef.current
    const viewport = viewportOf(view, size)
    const [west, north] = viewport.unproject([room.left, room.top])
    const [east, south] = viewport.unproject([
      size.width - room.right,
      size.height - room.bottom,
    ])
    fitWidth.current = groundWidth(areaInView(view, size))
    if (
      instant ||
      !fitsEvidence({
        rule,
        bounds: building.bounds,
        inView: { west, south, east, north },
        viewWidth: fitWidth.current,
      })
    ) {
      return
    }
    const around: Padding = {
      top: room.top + evidenceRoom,
      right: room.right + evidenceRoom,
      bottom: room.bottom + evidenceRoom,
      left: room.left + evidenceRoom,
    }
    const target = fitArea(evidenceArea(building, rule), size, around)
    const width = groundWidth(areaInView(target, size))
    const fit =
      width < closestWidth
        ? { ...target, zoom: target.zoom - Math.log2(closestWidth / width) }
        : target
    fitWidth.current = Math.max(width, closestWidth)
    camera.go({ camera: fit }, "visitor")
    // The building and its rule are its key
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, key, building])
  useEffect(() => {
    if (key === undefined) {
      fitted.current = undefined
    }
  }, [key])

  // Closed (with Escape, the close button or a click elsewhere), the map
  // shows the street: from the 500 m circle it glides back in to the
  // street around the building. Closed by zooming out, it stays out.
  const closedByZoom = useRef(false)
  const lastCentre = useRef(building?.centre)
  useEffect(() => {
    if (building) {
      lastCentre.current = building.centre
      closedByZoom.current = false
      return
    }
    const centre = lastCentre.current
    lastCentre.current = undefined
    const { camera: view, size, limits } = camera.state
    if (
      !centre ||
      closedByZoom.current ||
      !view ||
      groundWidth(areaInView(view, size)) < streetLevelWidth
    ) {
      return
    }
    camera.go({ camera: streetCamera(centre, size, limits) }, "visitor")
  }, [camera, building])

  // The facade in keyboard focus, until the building or the rule changes:
  // each change starts the facades again from the first, also when the
  // visitor comes back to the same building and rule (switching rules and
  // back to 3 trees used to bring back a facade still in focus, often the
  // last, from which Tab left the map)
  const [focus, setFocus] = useState<number>()
  const [focusFor, setFocusFor] = useState(key)
  if (focusFor !== key) {
    setFocusFor(key)
    setFocus(undefined)
  }
  const focused = rule === 3 ? focus : undefined

  // What screen readers hear: the building selected, the rule shown, the
  // facade selected or in focus, the last of them
  const [said, setSaid] = useState("")
  const heard = useRef<{ id?: number; rule?: Rule; facade?: number }>({})
  useEffect(() => {
    const before = heard.current
    heard.current = { id, rule, facade }
    // A building opened with the page is not read out: the page's name is
    if (!building || id === undefined || (instant && before.id === undefined)) {
      return
    }
    const record = selectedBuilding(building.record)
    const met = (shown: Rule) => (record.met[shown] ? "yes" : "no")
    let text: string | undefined
    if (before.id !== id) {
      text = t("selected", {
        score: rules.filter((shown) => record.met[shown]).length,
        rule,
        met: met(rule),
      })
    } else if (before.rule !== rule) {
      text = t("rule", { rule, met: met(rule) })
    } else if (before.facade !== facade) {
      const chosen = record.facades.find((item) => item.id === facade)
      text = chosen ? t("facadeSelected", describe(chosen)) : t("wholeBuilding")
    }
    if (text !== undefined) {
      setSaid(text)
    }
    // What is said follows the selection alone
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [id, rule, facade, building])

  const map = useMemo<SelectionMap | undefined>(
    () =>
      building
        ? {
            building,
            rule,
            facade,
            focusedFacade: focused,
            instant,
            onFacadePress: (sid: number) =>
              go({ facade: sid === facade ? undefined : sid }),
            onElsewhere: () => go({ building: undefined, facade: undefined }),
          }
        : undefined,
    [building, rule, facade, focused, instant, go]
  )

  // A facade reached with Tab, as it is read out
  const facadeInFocus = (sid: number) => {
    const record = building && selectedBuilding(building.record)
    const result = record?.facades.find((item) => item.id === sid)
    return result
      ? t("facade", {
          index: facades.findIndex((item) => item.sid === sid) + 1,
          count: facades.length,
          ...describe(result),
        })
      : ""
  }

  return {
    map,
    /** The width of the view the selection last fitted, in metres */
    fitWidth,
    /** Set when zooming out past the street closes the building */
    closedByZoom,
    /** What screen readers hear of the selection, while there is one */
    announcement: building ? said : "",
    /** Takes the selection's keys; true when it took the key */
    onKey: (event: KeyboardEvent<HTMLElement>, fromEnd: boolean) => {
      if (!building || event.altKey || event.ctrlKey || event.metaKey) {
        return false
      }
      switch (event.key) {
        case "ArrowLeft":
        case "ArrowRight": {
          const step = event.key === "ArrowRight" ? 1 : -1
          const next =
            rules[(rules.indexOf(rule) + step + rules.length) % rules.length]
          go({ rule: next, facade: undefined })
          return true
        }
        case "Tab": {
          if (rule !== 3) {
            return false
          }
          const step = capitalStep(
            facades.map(({ sid }) => sid),
            focused,
            event.shiftKey,
            fromEnd
          )
          if (step.leaves) {
            setFocus(undefined)
            return false
          }
          // Shift+Tab from the first facade: back to the map itself
          if (step.next === undefined) {
            setFocus(undefined)
            setSaid("")
            return true
          }
          setFocus(step.next)
          setSaid(facadeInFocus(step.next))
          return true
        }
        case "Enter":
          if (focused !== undefined) {
            go({ facade: focused === facade ? undefined : focused })
            return true
          }
          if (facade !== undefined) {
            go({ facade: undefined })
            return true
          }
          return false
        case "Escape":
          go({ building: undefined, facade: undefined })
          return true
        default:
          return false
      }
    },
    /** The map lost the focus: no facade is in focus any more */
    blur: () => setFocus(undefined),
  }
}

/**
 * A facade as the messages read it out: where it looks, the trees it sees,
 * and whether it sees enough
 */
const describe = (facade: {
  orientation: string
  trees: number
  met: boolean
}) => ({
  orientation: facade.orientation,
  trees: facade.trees,
  met: facade.met ? "yes" : "no",
})
