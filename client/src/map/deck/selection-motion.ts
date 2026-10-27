import { useEffect, useRef, useState } from "react"

import { prefersReducedMotion } from "@/design/reduced-motion"
import { tween, type MotionTokenName, type Tween } from "@/design/tween"
import type { BuildingSelection } from "@/lib/building-evidence"
import type { Rule } from "@/lib/rules"

/*
 * The motion of a selected building's evidence, frame by frame:
 * - selecting a building, everything else dims (the spotlight's veil fades
 *   in) and its evidence arrives: with the 3 trees rule its facades pop in,
 *   then the trees they see, while the sight lines draw themselves; with
 *   rule 30 the 500 m circle and its canopy fade in; with rule 300 the walk
 *   draws itself, then the park lifts into view at its end and its name
 *   fades in;
 * - another rule or another building: the evidence shown fades out, then
 *   the new one arrives;
 * - a facade selected: it thickens, and the other facades and their trees
 *   fade out; back to the whole building, the other way;
 * - closing: the veil and the evidence fade out.
 * Under reduced motion, everything fades in or out at once. A building
 * opened with the page is there at once.
 *
 * The values live in one object that the layers read; `redraw` is called
 * whenever they change.
 */

/** What is selected: a building, the rule shown, perhaps a facade */
export type SelectionTarget = {
  building: BuildingSelection
  rule: Rule
  facade: number | undefined
}

export type SelectionScene = {
  /** What is drawn, which lags behind the selection while it fades out */
  shown: SelectionTarget | undefined
  /** The veil over the rest of the map, 0 to 1 */
  veil: number
  /** The evidence shown, as a whole, 0 to 1 */
  evidence: number
  /** Rule 3: the facades popping in, the trees they see, the sight lines */
  facades: number
  trees: number
  sights: number
  /** Rule 30: the circle and its canopy */
  circle: number
  /** Rule 300: the walk drawing itself, the park lifting, its name */
  route: number
  park: number
  label: number
  /** The selected facade thickening, and the others fading out */
  thick: number
  others: number
  /** Nothing is moving */
  settled: boolean
}

const rest = (): SelectionScene => ({
  shown: undefined,
  veil: 0,
  evidence: 0,
  facades: 0,
  trees: 0,
  sights: 0,
  circle: 0,
  route: 0,
  park: 0,
  label: 0,
  thick: 0,
  others: 1,
  settled: true,
})

type Value = Exclude<keyof SelectionScene, "shown" | "settled">

/** When each part of a rule's evidence starts, in milliseconds */
const delays = { facades: 140, trees: 260, circle: 120, label: 200 }
/** How long the sight lines and the walk take to draw, in milliseconds */
const draws = { sights: 700, route: 900 }

const keyOf = (target: SelectionTarget | undefined) =>
  target ? `${target.building.record.id}|${target.rule}` : ""

export function useSelectionMotion({
  target,
  instant,
  redraw,
}: {
  target: SelectionTarget | undefined
  /** Whether it is there at once (as the page opens) */
  instant: boolean
  /** Stable: the same function for the life of the map */
  redraw: () => void
}): SelectionScene {
  const [scene] = useState(rest)
  const running = useRef(new Map<Value, Tween>())

  // A value moving to its end with a token's curve or spring; under reduced
  // motion, a fade of at most 280 ms
  const to = (
    value: Value,
    end: number,
    token: MotionTokenName,
    options: { delay?: number; duration?: number; onComplete?: () => void } = {}
  ) => {
    running.current.get(value)?.cancel()
    const from = scene[value]
    const reduced = prefersReducedMotion()
    scene.settled = false
    running.current.set(
      value,
      tween({
        from,
        to: end,
        token,
        ...options,
        reducedMotion: reduced,
        onUpdate: (next) => {
          if (!reduced) {
            scene[value] = next
            redraw()
          }
        },
        onFade: (progress) => {
          scene[value] = from + (end - from) * progress
          redraw()
        },
        onComplete: () => {
          running.current.delete(value)
          scene[value] = end
          options.onComplete?.()
          scene.settled = running.current.size === 0
          redraw()
        },
      })
    )
  }
  const set = (values: Partial<Record<Value, number>>) => {
    for (const [value, next] of Object.entries(values) as Array<
      [Value, number]
    >) {
      running.current.get(value)?.cancel()
      running.current.delete(value)
      scene[value] = next
    }
    scene.settled = running.current.size === 0
    redraw()
  }

  // A rule's evidence arriving
  const arrive = (shown: SelectionTarget, now: boolean) => {
    scene.shown = shown
    const facade = shown.facade !== undefined
    const settled = {
      facades: 1,
      trees: 1,
      sights: 1,
      circle: 1,
      route: 1,
      park: 1,
      label: 1,
      thick: facade ? 1 : 0,
      others: facade ? 0 : 1,
    }
    if (now) {
      set({ ...settled, evidence: 1 })
      return
    }
    if (prefersReducedMotion()) {
      set({ ...settled, evidence: 0 })
      to("evidence", 1, "fade")
      return
    }
    set({
      evidence: 1,
      facades: 0,
      trees: 0,
      sights: 0,
      circle: 0,
      route: 0,
      park: 0,
      label: 0,
      thick: settled.thick,
      others: settled.others,
    })
    if (shown.rule === 3) {
      to("facades", 1, "pop", { delay: delays.facades })
      to("trees", 1, "pop", { delay: delays.trees })
      to("sights", 1, "draw", {
        delay: delays.trees,
        duration: draws.sights,
      })
    } else if (shown.rule === 30) {
      to("circle", 1, "fade", { delay: delays.circle })
    } else {
      const walk = shown.building.route ? draws.route : 0
      to("route", 1, "draw", { duration: draws.route })
      to("park", 1, "lift", { delay: walk })
      to("label", 1, "fade", { delay: walk + delays.label })
    }
  }

  const shownKey = useRef("")
  const facadeShown = useRef<number | undefined>(undefined)
  const targetRef = useRef(target)
  targetRef.current = target
  const key = keyOf(target)
  const facade = target?.facade
  useEffect(() => {
    const next = targetRef.current
    const fadeOut = (onComplete: () => void) => {
      for (const value of running.current.keys()) {
        if (value !== "veil") {
          running.current.get(value)?.cancel()
          running.current.delete(value)
        }
      }
      to("evidence", 0, "fade", { onComplete })
    }

    if (key === shownKey.current) {
      // The same building and rule: perhaps another facade
      if (next && scene.shown && facade !== facadeShown.current) {
        facadeShown.current = facade
        scene.shown = next
        set({ thick: 0 })
        to("thick", facade === undefined ? 0 : 1, "pop")
        to("others", facade === undefined ? 1 : 0, "fade")
      }
      return
    }
    const before = shownKey.current
    shownKey.current = key
    facadeShown.current = facade

    if (!next) {
      // Closed: the spotlight fades, and the evidence with it
      to("veil", 0, "fade")
      fadeOut(() => {
        scene.shown = undefined
        redraw()
      })
      return
    }
    if (before === "" || !scene.shown) {
      if (instant) {
        set({ veil: 1 })
      } else {
        to("veil", 1, "fade")
      }
      arrive(next, instant)
      return
    }
    // Another rule or building: the evidence shown fades out first; under
    // reduced motion the new one only fades in
    to("veil", 1, "fade")
    if (prefersReducedMotion()) {
      arrive(next, false)
      return
    }
    fadeOut(() => arrive(targetRef.current ?? next, false))
    // The values are read through the shared object
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key, facade])

  useEffect(
    () => () => {
      for (const motion of running.current.values()) {
        motion.cancel()
      }
    },
    []
  )

  return scene
}
