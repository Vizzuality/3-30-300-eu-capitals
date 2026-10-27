import { useNavigate } from "@tanstack/react-router"
import { useCallback, useMemo, useState, type KeyboardEvent } from "react"
import { useTranslations } from "use-intl"

import { standInBuilding } from "@/data/stand-in-buildings"
import type { CapitalSlug } from "@/lib/capitals"
import {
  nearestBuildings,
  pulseBuilding,
  type StreetBuilding,
} from "@/lib/street-buildings"
import type { MapPulse } from "./city-overview"
import { capitalStep } from "./home-capitals"
import { useMapCamera, type MapCamera } from "./map-camera"
import type { StreetMap } from "./renderer"

/*
 * A capital's street level, around the map: the guide's pulse on the
 * building with results nearest to where the visitor zoomed in, and the
 * keyboard. Tab and Shift+Tab go through the buildings with results nearest
 * the centre of the view (up to 12, nearest first), each lifted with a focus
 * ring and read out with its result, then Tab leaves the map; moving the map
 * starts the list again from the new centre. Enter, or a click, selects the
 * building.
 *
 * Selecting is the next step's (reading a building's evidence from the
 * tiles); until then, only the stand-in release's few buildings with
 * figures can be opened, through the address, as from a link.
 */
export function useStreetLevel({
  camera,
  slug,
  onStreet,
}: {
  camera: MapCamera
  /** The capital shown, on its page */
  slug: CapitalSlug | undefined
  /** Whether the map shows the street, with no building selected */
  onStreet: boolean
}) {
  const t = useTranslations("map.announce")
  const navigate = useNavigate()
  const [buildings, setBuildings] = useState<ReadonlyArray<StreetBuilding>>([])
  const moves = useMapCamera(camera, (state) => state.visitorMoves)

  // Each visit to the street places the pulse once, where the map then is;
  // it leaves as soon as the visitor moves the map
  const place = slug !== undefined && onStreet ? slug : undefined
  const [visit, setVisit] = useState<{
    place: CapitalSlug | undefined
    count: number
    moves: number
    at: readonly [number, number] | undefined
  }>({ place: undefined, count: 0, moves: 0, at: undefined })
  if (visit.place !== place) {
    // The map tells the buildings in view again as the street starts
    setBuildings([])
    setVisit({
      place,
      count: visit.count + 1,
      moves,
      at: undefined,
    })
  }
  // Where the camera lands: where the visitor zoomed in
  const landing = camera.destination
  if (
    place !== undefined &&
    visit.at === undefined &&
    buildings.length > 0 &&
    landing
  ) {
    const building = pulseBuilding(buildings, [
      landing.longitude,
      landing.latitude,
    ])
    if (building) {
      setVisit({ ...visit, at: [building.longitude, building.latitude] })
    }
  }
  const pulse = useMemo<MapPulse | undefined>(
    () =>
      place !== undefined &&
      visit.place === place &&
      visit.at !== undefined &&
      moves === visit.moves
        ? {
            key: `street-${place}-${visit.count}`,
            at: [visit.at[0], visit.at[1]],
          }
        : undefined,
    [place, visit, moves]
  )

  // The buildings Tab goes through, from the centre of the view when the
  // first Tab is pressed, until the map moves
  const [focus, setFocus] = useState<{
    order: ReadonlyArray<StreetBuilding>
    moves: number
    focused: number | undefined
  }>()
  const current = focus && focus.moves === moves && onStreet ? focus : undefined
  const focused = current?.focused

  const select = useCallback(
    (id: number) => {
      if (!slug || !standInBuilding(slug, id)) {
        return
      }
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => ({
          ...previous,
          building: id,
        }),
        resetScroll: false,
      } as never)
    },
    [navigate, slug]
  )

  const street = useMemo<StreetMap | undefined>(
    () =>
      onStreet
        ? { focused, onPress: select, onBuildings: setBuildings }
        : undefined,
    [onStreet, focused, select]
  )

  const index = current?.order.findIndex(({ id }) => id === focused) ?? -1
  const building = index >= 0 ? current?.order[index] : undefined

  return {
    street,
    /** The guide's pulse, on the street, until the map is moved */
    pulse,
    /** What screen readers hear of the building in focus */
    announcement: building
      ? t("building", {
          index: index + 1,
          count: current?.order.length ?? 0,
          score: building.score,
        })
      : "",
    /** Takes Tab and Enter among the buildings; true when it took the key */
    onKey: (event: KeyboardEvent<HTMLElement>, fromEnd: boolean) => {
      if (!onStreet || event.altKey || event.ctrlKey || event.metaKey) {
        return false
      }
      if (event.key === "Tab") {
        const { camera: view } = camera.state
        const order =
          current?.order ??
          (view
            ? nearestBuildings(buildings, [view.longitude, view.latitude])
            : [])
        const step = capitalStep(
          order.map(({ id }) => id),
          focused,
          event.shiftKey,
          fromEnd
        )
        if (step.leaves) {
          setFocus(undefined)
          return false
        }
        setFocus({ order, moves, focused: step.next })
        return true
      }
      if (event.key === "Enter" && focused !== undefined) {
        select(focused)
        return true
      }
      return false
    },
    /** The map lost the focus: no building is in focus any more */
    blur: () => setFocus(undefined),
  }
}
