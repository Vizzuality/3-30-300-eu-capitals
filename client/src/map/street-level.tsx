import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useCallback, useMemo, useState, type KeyboardEvent } from "react"
import { useTranslations } from "use-intl"

import { buildingTileQuery, evidenceTileOf } from "@/data/building-query"
import type { CapitalSlug } from "@/lib/capitals"
import {
  nearestBuildings,
  pulseBuilding,
  type StreetBuilding,
} from "@/lib/street-buildings"
import type { MapPulse } from "./city-overview"
import { capitalStep, type LngLat } from "./home-capitals"
import { useMapCamera, type MapCamera } from "./map-camera"
import type { StreetMap } from "./renderer"

/*
 * A capital's street level, around the map: the guide's pulse on the
 * building with results nearest to where the visitor zoomed in, and the
 * keyboard. Tab and Shift+Tab go through the buildings with results nearest
 * the centre of the view (up to 12, nearest first), each lifted with a focus
 * ring and read out with its result, then Tab leaves the map; moving the map
 * starts the list again from the new centre. Enter, or a click, selects the
 * building, which wobbles and sends out a ring.
 *
 * With a building selected, the street stays: clicking another building
 * selects it instead, keeping the rule shown, and clicking the selected
 * building goes back from its facade to the whole building. The keyboard is
 * the selection's then.
 */
export function useStreetLevel({
  camera,
  slug,
  onStreet,
  selected,
  onPress,
}: {
  camera: MapCamera
  /** The capital shown, on its page */
  slug: CapitalSlug | undefined
  /** Whether the map shows the street (a building selected or not) */
  onStreet: boolean
  /** The selected building, and its facade selected */
  selected: { id: number; facade: number | undefined } | undefined
  /** A building pressed, which sends out a ring there */
  onPress: (at: LngLat, building: number) => void
}) {
  const t = useTranslations("map.announce")
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [buildings, setBuildings] = useState<ReadonlyArray<StreetBuilding>>([])
  const moves = useMapCamera(camera, (state) => state.visitorMoves)

  // Each visit to the street places the pulse once, where the map then is;
  // it leaves as soon as the visitor moves the map. A selected building has
  // the guide alone.
  const browsing = onStreet && selected === undefined
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
      browsing &&
      visit.place === place &&
      visit.at !== undefined &&
      moves === visit.moves
        ? {
            key: `street-${place}-${visit.count}`,
            at: [visit.at[0], visit.at[1]],
          }
        : undefined,
    [place, browsing, visit, moves]
  )

  // The buildings Tab goes through, from the centre of the view when the
  // first Tab is pressed, until the map moves
  const [focus, setFocus] = useState<{
    order: ReadonlyArray<StreetBuilding>
    moves: number
    focused: number | undefined
  }>()
  const current = focus && focus.moves === moves && browsing ? focus : undefined
  const focused = current?.focused

  // The selected building is the address's: each a step in the history
  const chosenId = selected?.id
  const chosenFacade = selected?.facade
  const select = useCallback(
    (id: number, at?: LngLat) => {
      if (!slug) {
        return
      }
      const building = buildings.find((item) => item.id === id)
      const pressed: LngLat | undefined =
        at ?? (building ? [building.longitude, building.latitude] : undefined)
      if (pressed) {
        onPress(pressed, id)
      }
      // Its evidence is in the tile of its representative point
      if (building) {
        queryClient.setQueryData(
          buildingTileQuery(slug, id).queryKey,
          evidenceTileOf([building.longitude, building.latitude])
        )
      }
      if (chosenId === id && chosenFacade === undefined) {
        return
      }
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => ({
          ...previous,
          building: id,
          facade: undefined,
        }),
        resetScroll: false,
      } as never)
    },
    [navigate, slug, queryClient, onPress, buildings, chosenId, chosenFacade]
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
      if (!browsing || event.altKey || event.ctrlKey || event.metaKey) {
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
