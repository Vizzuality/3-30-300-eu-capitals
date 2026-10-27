import { useCallback, useMemo, useState, type KeyboardEvent } from "react"

import { PulseDot } from "@/components/map/pulse-dot"
import { PulseTag } from "@/components/map/pulse-tag"
import type { Summary } from "@/data/schemas"
import { env } from "@/env"
import type { CapitalSlug } from "@/lib/capitals"
import { streetCamera, viewportOf } from "./camera"
import { capitalArchives, cityTileArea } from "./capital-archives"
import type { LngLat } from "./home-capitals"
import { useMapCamera, type MapCamera } from "./map-camera"
import type { CapitalMap } from "./renderer"

/** The Next step guide's pulse on the map */
export type MapPulse = {
  /** A pulse placed again has a new key, and nudges again */
  key: string
  at: LngLat
}

/*
 * A capital's city overview: what the map draws of the capital (its grid,
 * its water and its limits, from the archives the release has), the guide's
 * pulse on the city's suggested place, and zooming in to the street where
 * the visitor clicks or taps, or at the centre of the view with Enter.
 *
 * The pulse is placed each time the map reaches the overview (as the page
 * opens, or back from the street) and leaves as soon as the visitor moves
 * the map: a drag, a scroll, a pinch, a key, a button or a click.
 */
export function useCityOverview({
  camera,
  slug,
  summary,
  onOverview,
  onPress,
}: {
  camera: MapCamera
  /** The capital shown, on its page */
  slug: CapitalSlug | undefined
  /** Its summary, once loaded */
  summary: Summary | undefined
  /** Whether the map shows the city overview */
  onOverview: boolean
  /** A place zoomed into, which sends out a ring */
  onPress: (at: LngLat) => void
}) {
  // Placed each time the overview is reached, then left once the map moves
  const place = slug !== undefined && onOverview ? slug : undefined
  const [placed, setPlaced] = useState<{
    place: CapitalSlug | undefined
    moves: number
    count: number
  }>({ place: undefined, moves: 0, count: 0 })
  if (placed.place !== place) {
    setPlaced({
      place,
      moves: camera.state.visitorMoves,
      count: placed.count + 1,
    })
  }
  const moved = useMapCamera(
    camera,
    (state) => state.visitorMoves !== placed.moves
  )
  const pulse = useMemo<MapPulse | undefined>(
    () =>
      place !== undefined && placed.place === place && !moved && summary
        ? { key: `${place}-${placed.count}`, at: summary.suggested }
        : undefined,
    [place, placed, moved, summary]
  )

  const zoomIn = useCallback(
    (at: LngLat) => {
      const { size, limits } = camera.state
      onPress(at)
      camera.go({ camera: streetCamera(at, size, limits) }, "visitor")
    },
    [camera, onPress]
  )

  const map = useMemo<CapitalMap | undefined>(
    () =>
      summary
        ? {
            slug: summary.slug,
            bbox: summary.bbox,
            zooms: summary.zooms,
            context: summary.context,
            areaKm2: summary.area_km2,
            archives: capitalArchives(summary, env.VITE_DATA_RELEASE),
            cityArea: cityTileArea(summary, env.VITE_DATA_RELEASE),
            labelChars: summary.label_chars,
            onPress: onOverview ? zoomIn : undefined,
          }
        : undefined,
    [summary, onOverview, zoomIn]
  )

  return {
    map,
    /** The guide's pulse, on the city overview, until the map is moved */
    pulse,
    /** Takes Enter, which zooms in at the centre; true when it took it */
    onKey: (event: KeyboardEvent<HTMLElement>) => {
      const { camera: shown } = camera.state
      if (
        !map?.onPress ||
        !shown ||
        event.key !== "Enter" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return false
      }
      zoomIn([shown.longitude, shown.latitude])
      return true
    },
  }
}

/**
 * The guide's pulse: its dot and its tag, where the camera shows it, on the
 * city overview or the street
 */
export function GuidePulse({
  camera,
  pulse,
  state,
}: {
  camera: MapCamera
  pulse: MapPulse | undefined
  state: "overview" | "street"
}) {
  // Where the pulse is on screen, to the half pixel; kept as it leaves
  const [last, setLast] = useState(pulse)
  if (pulse && pulse !== last) {
    setLast(pulse)
  }
  const placed = useMapCamera(camera, ({ camera: shown, size }) => {
    if (!last || !shown) {
      return ""
    }
    const [x, y] = viewportOf(shown, size).project(last.at)
    const half = (value: number) => Math.round(value * 2) / 2
    return `${half(x)},${half(y)}`
  })
  const [x, y] = placed ? placed.split(",").map(Number) : [0, 0]

  const shown = pulse !== undefined && placed !== ""
  return (
    <>
      <PulseDot x={x} y={y} placed={shown ? pulse.key : undefined} />
      <PulseTag state={state} x={x} y={y} visible={shown} />
    </>
  )
}
