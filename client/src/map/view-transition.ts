import { addMetersToLngLat, lngLatToWorld } from "@math.gl/web-mercator"
import { cubicBezier } from "motion"

import {
  motionDetails,
  motionTokens,
  type Curve,
  type SpringToken,
} from "@/design/tokens"
import { dampingRatio, naturalFrequency } from "@/design/tokens-motion"
import type { CapitalSlug } from "@/lib/capitals"
import type { VisibleArea } from "@/lib/visible-area"
import type { HomeCapital, LngLat } from "./home-capitals"

/*
 * The transitions between the map's views, whatever draws the map:
 * - opening a capital from Home: the other capitals sink in a ripple
 *   outwards while the camera flies to it, its outline grows into the real
 *   city, then the city's 10 m grid opens from the centre;
 * - opening a capital from another: the city left sinks and fades, the
 *   camera jumps, and the new one lifts into place, its shadow growing;
 * - back to Home ("All capitals"): the city sinks, the camera flies back out
 *   to Europe and the capitals rise back into place.
 * The map shows the place it leaves until it has sunk, so a transition that
 * leaves a city has two phases: leaving, then arriving. Under reduced
 * motion, each becomes a fade of at most 280 ms, and the camera jumps.
 */

/** A place the map shows: Europe, or a capital's city */
export type MapPlace = "home" | `capital:${CapitalSlug}`

export type TransitionKind = "open" | "switch" | "back"

export type MapTransition = {
  /** A new transition has a new id */
  id: number
  kind: TransitionKind
  /** The capital left (from another capital, back to Home) */
  from: CapitalSlug | undefined
  /** The capital opened (from Home, from another capital) */
  to: CapitalSlug | undefined
  /** Leaving: the map still shows the place left, as it sinks */
  phase: "leaving" | "arriving"
  /**
   * Arriving: whether the place arrived at is known (a city's limits, once
   * loaded, or known to be missing), so the camera can be there
   */
  ready: boolean
}

/** The capital of a place, if it is one */
export const capitalOf = (place: MapPlace) =>
  place === "home" ? undefined : (place.slice(8) as CapitalSlug)

/** The transition from one place of the map to another, if they differ */
export function transitionKind(
  from: MapPlace,
  to: MapPlace
): TransitionKind | undefined {
  if (from === to) {
    return undefined
  }
  if (from === "home") {
    return "open"
  }
  return to === "home" ? "back" : "switch"
}

/** How long the place left takes to sink, in milliseconds */
export function leavingDuration(reducedMotion: boolean) {
  const { duration } = motionTokens.sink
  return reducedMotion
    ? Math.min(duration, motionDetails.reducedFade)
    : duration
}

const curves = new Map<string, (progress: number) => number>()

/** Where a curve is at `progress` (kept between 0 and 1) */
export function eased(curve: Curve, progress: number) {
  const key = curve.join()
  let ease = curves.get(key)
  if (!ease) {
    ease = cubicBezier(...curve)
    curves.set(key, ease)
  }
  return ease(Math.min(1, Math.max(0, progress)))
}

/**
 * Where a spring token is, from 0 to 1 (beyond 1 as it overshoots), `time`
 * milliseconds after it starts: as the motion tokens define it, by its
 * duration and its overshoot
 */
export function springAt(token: SpringToken, time: number) {
  if (time <= 0) {
    return 0
  }
  const ratio = dampingRatio(token.overshoot)
  const frequency = naturalFrequency(token.duration, ratio)
  const seconds = time / 1000
  const decay = Math.exp(-ratio * frequency * seconds)
  if (ratio >= 1) {
    return 1 - decay * (1 + frequency * seconds)
  }
  const damped = frequency * Math.sqrt(1 - ratio ** 2)
  return (
    1 -
    decay *
      (Math.cos(damped * seconds) +
        ((ratio * frequency) / damped) * Math.sin(damped * seconds))
  )
}

/**
 * How far along its ripple each capital is, from 0 (the nearest to `from`,
 * first) to 1 (the farthest, last), measured on the map as drawn
 */
export function rippleShares(
  capitals: ReadonlyArray<{ slug: CapitalSlug; display: LngLat }>,
  from: LngLat
): Map<CapitalSlug, number> {
  const [x0, y0] = lngLatToWorld(from)
  const distances = capitals.map(({ slug, display }) => {
    const [x, y] = lngLatToWorld(display)
    return [slug, Math.hypot(x - x0, y - y0)] as const
  })
  const farthest = Math.max(0, ...distances.map(([, distance]) => distance))
  return new Map(
    distances.map(([slug, distance]) => [
      slug,
      farthest > 0 ? distance / farthest : 0,
    ])
  )
}

/**
 * How much a capital opened from Home is enlarged at `zoom`: as on Home
 * (`scale` times) while the camera has zoomed in less than that from
 * `homeZoom`, so it keeps its size on screen, then at its true size, so it
 * grows with the map
 */
export function grownScale(scale: number, homeZoom: number, zoom: number) {
  return Math.max(1, scale * 2 ** (homeZoom - zoom))
}

/**
 * Where an outline enlarged `grown` times is drawn: where Home shows it, at
 * its Home enlargement, moving to where the city really is as it reaches its
 * true size
 */
export function grownOrigin(
  { display, centre, scale }: Pick<HomeCapital, "display" | "centre" | "scale">,
  grown: number
): LngLat {
  const share = scale > 1 ? (scale - grown) / (scale - 1) : 1
  const amount = Math.min(1, Math.max(0, share))
  return [
    display[0] + (centre[0] - display[0]) * amount,
    display[1] + (centre[1] - display[1]) * amount,
  ]
}

/**
 * The area of a capital's outline at its true size, around where the city
 * really is: where the camera heads when the capital opens from Home, until
 * the city's own limits are loaded
 */
export function trueArea({
  outline,
  centre,
}: Pick<HomeCapital, "outline" | "centre">): VisibleArea {
  const points = outline.flat(2)
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const [west, south] = addMetersToLngLat(centre, [
    Math.min(...xs),
    Math.min(...ys),
  ])
  const [east, north] = addMetersToLngLat(centre, [
    Math.max(...xs),
    Math.max(...ys),
  ])
  return { west, south, east, north }
}
