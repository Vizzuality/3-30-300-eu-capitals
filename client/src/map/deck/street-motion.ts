import { useCallback, useEffect, useRef, useState } from "react"

import { motionDetails, motionTokens } from "@/design/tokens"
import { prefersReducedMotion } from "@/design/reduced-motion"
import { tween, type Tween } from "@/design/tween"
import { interpolate } from "motion"
import type { LngLat } from "@/map/home-capitals"
import { viewportOf } from "@/map/camera"
import { useMapCamera, type MapCamera } from "@/map/map-camera"
import type { MapPress } from "@/map/renderer"
import { makeHiddenIds, type HiddenIds } from "./hide-extension"
import { makeRevealClock, type RevealClock } from "./reveal-extension"
import { buildingShadowOffset, type LiftedBuilding } from "./street-layers"

/*
 * The motion of the street level, frame by frame:
 * - the arrival from the city overview, where the visitor clicked or
 *   pressed Enter: the grid gives way in rings around that point, the
 *   street's ground appears with it, buildings pop in three waves and trees
 *   in one (`RevealExtension`), then the street names fade in. Reached by a
 *   gesture, the grid only fades out; reached as a page opens, the street
 *   is there at once. Under reduced motion, everything fades in at once;
 * - leaving it, the grid fades back over the buildings, which stay until it
 *   has;
 * - the building under the pointer or in keyboard focus lifts (Lift), its
 *   shadow growing, and the one it leaves settles back. Under reduced
 *   motion it does not rise: its edge only turns Ink;
 * - a selected building wobbles once (Squash) and stays lifted until it is
 *   closed, then settles back.
 *
 * The values live in shared objects the layers read as they are drawn:
 * `repaint` draws again, `redraw` makes the layers again.
 */

/** How long the arrival takes, from its start to the names, in milliseconds */
const arrivalPops = 120 + 3 * 120 + motionTokens.pop.duration
/** The longest a ring of the grid waits, plus its fade */
const arrivalRings = 6 * 70 + 240
/** How far the building under the pointer rises, in pixels */
const liftRise = 2
/** Its shadow, lifted, in pixels (x right, y down) */
const liftedShadow = [2.2, 3.4] as const

export type StreetMotion = {
  reveal: RevealClock
  hidden: HiddenIds
  lifted: ReadonlyArray<LiftedBuilding>
  /** The overview's opacity over the street: 1 shown, 0 gone (as it is now) */
  readonly overview: number
  /** Whether the street is drawn (also while the grid fades back over it) */
  readonly drawn: boolean
  /** The street names' opacity */
  readonly names: number
  /** The street's tiles in view are loaded */
  onTilesLoaded: () => void
  /** The building under the pointer, as soon as it changes */
  hover: (id: number | undefined) => void
}

export function useStreetMotion({
  camera,
  street,
  press,
  hovered,
  focused,
  selected,
  redraw,
  redrawNow,
  repaint,
}: {
  camera: MapCamera
  /** Whether the camera shows the street level */
  street: boolean
  /** The last press, which zooms in from the overview */
  press: MapPress | undefined
  /** The building under the pointer, and the one in keyboard focus */
  hovered: number | undefined
  focused: number | undefined
  /** The selected building, lifted while it is selected */
  selected: number | undefined
  redraw: () => void
  /** Makes the layers again at once */
  redrawNow: () => void
  repaint: () => void
}): StreetMotion {
  const [reveal] = useState(makeRevealClock)
  const [hidden] = useState(makeHiddenIds)
  const state = useRef({
    overview: street ? 0 : 1,
    names: street ? 1 : 0,
    drawn: street,
  })
  // The values are read as the layers are made: drawing again is enough
  const changed = redraw

  // The press that zoomed in last, and whether it has been used
  const pressRef = useRef(press)
  pressRef.current = press
  const usedPress = useRef<number | undefined>(press?.id)
  const fades = useRef<Array<Tween>>([])
  const frame = useRef(0)
  const ending = useRef<ReturnType<typeof setTimeout>>(undefined)
  const waitingForTiles = useRef(false)

  const stopAll = () => {
    for (const fade of fades.current) {
      fade.cancel()
    }
    fades.current = []
    cancelAnimationFrame(frame.current)
    clearTimeout(ending.current)
    waitingForTiles.current = false
  }

  const fadeTo = useCallback(
    (key: "overview" | "names", to: number, onComplete?: () => void) => {
      const from = state.current[key]
      if (from === to) {
        onComplete?.()
        return
      }
      fades.current.push(
        tween({
          from,
          to,
          token: "fade",
          onUpdate: (value) => {
            state.current[key] = value
            changed()
          },
          onFade: (progress) => {
            state.current[key] = from + (to - from) * progress
            changed()
          },
          onComplete,
        })
      )
    },
    [changed]
  )

  // Where the waves start, followed on screen while the camera moves
  const arrivalAt = useRef<LngLat | undefined>(undefined)
  const follow = useCallback(() => {
    const { camera: shown, size } = camera.state
    if (shown && arrivalAt.current) {
      const [x, y] = viewportOf(shown, size).project(arrivalAt.current)
      reveal.origin = [x, y]
    }
  }, [camera, reveal])

  const run = useCallback(() => {
    reveal.phase = "running"
    reveal.start = performance.now()
    follow()
    changed()
    const total = reveal.reduced ? 0 : Math.max(arrivalPops, arrivalRings)
    // Each frame draws the arrival as it is then
    const step = () => {
      follow()
      repaint()
      frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    // It ends on time, even when frames come late (a slow device's first
    // frames of the street): the overview is gone, and everything rests
    ending.current = setTimeout(
      () => {
        cancelAnimationFrame(frame.current)
        reveal.phase = "off"
        state.current.overview = 0
        changed()
        fadeTo("names", 1)
      },
      Math.max(total, 300)
    )
  }, [reveal, follow, repaint, changed, fadeTo])

  // Reaching the street, and leaving it; as the map first shows, at once
  const known = useMapCamera(camera, (shown) => shown.camera !== undefined)
  const wasStreet = useRef<boolean | undefined>(undefined)
  useEffect(() => {
    if (!known || street === wasStreet.current) {
      return
    }
    const first = wasStreet.current === undefined
    wasStreet.current = street
    stopAll()
    const current = state.current
    if (first) {
      reveal.phase = "off"
      current.overview = street ? 0 : 1
      current.names = street ? 1 : 0
      current.drawn = street
      usedPress.current = pressRef.current?.id
      changed()
    } else if (street) {
      current.drawn = true
      const pressed = pressRef.current
      const arrival =
        pressed !== undefined &&
        pressed.id !== usedPress.current &&
        pressed.slug === undefined
      usedPress.current = pressed?.id
      if (arrival && current.overview > 0.99) {
        // Everything waits for the street's tiles, as before the arrival
        arrivalAt.current = pressed.at
        reveal.reduced = prefersReducedMotion()
        reveal.phase = "armed"
        current.names = 0
        waitingForTiles.current = true
      } else {
        reveal.phase = "off"
        current.names = 0
        fadeTo("overview", 0, () => fadeTo("names", 1))
      }
      changed()
    } else {
      reveal.phase = "off"
      current.names = 0
      fadeTo("overview", 1, () => {
        state.current.drawn = false
        changed()
      })
      changed()
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [street, known])
  useEffect(() => () => stopAll(), [])

  const onTilesLoaded = useCallback(() => {
    if (waitingForTiles.current) {
      waitingForTiles.current = false
      run()
    }
  }, [run])

  // The lifted buildings, in four fixed places (the one leaving, the one
  // under the pointer, the one in keyboard focus, the one selected), each
  // drawn by its own layers, whose data never changes: a new building in a
  // place only changes the ids and offsets they read as they are drawn, so
  // hovering from building to building computes no attribute.
  // Only one building leaves at a time: when another one leaves, the one
  // still settling back rests at once. The layers of an empty place are not
  // drawn. The selected building is never lifted a second time under the
  // pointer or in focus.
  const [slots] = useState(makeSlots)
  const motions = useRef(
    slots.map(() => ({ value: 0, tween: undefined as Tween | undefined }))
  )
  const squash = useRef<Tween | undefined>(undefined)
  const liftTo = useCallback(
    (
      underPointer: number | undefined,
      inKeyboardFocus: number | undefined,
      chosen: number | undefined
    ) => {
      const [leaving, under, inFocus, picked] = [0, 1, 2, 3]
      const reduced = prefersReducedMotion()
      // Where a place's building is drawn, as it rises from 0 to 1
      const place = (index: number) => {
        const rise = reduced ? 0 : motions.current[index].value
        const slot = slots[index]
        slot.offset[1] = -liftRise * rise
        slot.shadow[0] =
          buildingShadowOffset[0] +
          (liftedShadow[0] - buildingShadowOffset[0]) * rise
        slot.shadow[1] =
          buildingShadowOffset[1] +
          (liftedShadow[1] - buildingShadowOffset[1]) * rise
      }
      const show = (index: number, id: number, value: number) => {
        motions.current[index].tween?.cancel()
        motions.current[index] = { value, tween: undefined }
        slots[index].id = id
        slots[index].only.ids[0] = id
        place(index)
      }
      const rise = (index: number, to: number) => {
        const motion = motions.current[index]
        motion.tween?.cancel()
        motion.tween = tween({
          from: motion.value,
          to,
          token: "lift",
          reducedMotion: reduced,
          onUpdate: (value) => {
            motion.value = value
            place(index)
            repaint()
          },
          onComplete: () => {
            motion.tween = undefined
            if (to === 0) {
              show(index, -1, 0)
              redrawNow()
            }
          },
        })
      }
      const chosenId = chosen ?? -1
      // The selected building: it wobbles once and stays lifted, or settles
      // back, still drawn in its place until it rests
      if (slots[picked].id !== chosenId) {
        squash.current?.cancel()
        slots[picked].squash[0] = 1
        slots[picked].squash[1] = 1
        if (chosenId === -1) {
          rise(picked, 0)
        } else {
          // From where it was lifted under the pointer or in focus, if it was
          const lifted = [under, inFocus].find(
            (index) => slots[index].id === chosenId
          )
          show(
            picked,
            chosenId,
            lifted === undefined ? 0 : motions.current[lifted].value
          )
          rise(picked, 1)
          if (!reduced) {
            const { times, x, y } = motionDetails.squashKeyframes
            const width = interpolate([...times], [...x])
            const height = interpolate([...times], [...y])
            squash.current = tween({
              from: 0,
              to: 1,
              token: "squash",
              onUpdate: (progress) => {
                slots[picked].squash[0] = width(progress)
                slots[picked].squash[1] = height(progress)
                repaint()
              },
            })
          }
        }
      }
      const hoveredId =
        underPointer === undefined || underPointer === chosenId
          ? -1
          : underPointer
      if (slots[under].id !== hoveredId) {
        const previous = slots[under].id
        const previousValue = motions.current[under].value
        if (hoveredId !== -1 && slots[leaving].id === hoveredId) {
          // Back to the building that was settling, from where it is
          const value = motions.current[leaving].value
          show(leaving, -1, 0)
          show(under, hoveredId, value)
        } else {
          show(under, hoveredId, 0)
        }
        if (previous !== -1 && previous !== chosenId) {
          show(leaving, previous, previousValue)
          rise(leaving, 0)
        }
        if (hoveredId !== -1) {
          rise(under, 1)
        }
      }
      const focusedId =
        inKeyboardFocus === undefined || inKeyboardFocus === chosenId
          ? -1
          : inKeyboardFocus
      if (slots[inFocus].id !== focusedId) {
        show(inFocus, focusedId, 0)
        if (focusedId !== -1) {
          rise(inFocus, 1)
        }
      }
      redrawNow()
    },
    [slots, redrawNow, repaint]
  )
  useEffect(
    () => liftTo(hovered, focused, selected),
    [liftTo, hovered, focused, selected]
  )
  useEffect(() => () => squash.current?.cancel(), [])
  // At once, as the pointer moves: no React render in between
  const keptRef = useRef({ focused, selected })
  useEffect(() => {
    keptRef.current = { focused, selected }
  }, [focused, selected])
  const hover = useCallback(
    (id: number | undefined) =>
      liftTo(id, keptRef.current.focused, keptRef.current.selected),
    [liftTo]
  )

  return {
    reveal,
    hidden,
    lifted: slots,
    hover,
    get overview() {
      return state.current.overview
    },
    get drawn() {
      return state.current.drawn || street
    },
    get names() {
      return state.current.names
    },
    onTilesLoaded,
  }
}

/**
 * The four places of lifted buildings (leaving, under the pointer, in
 * keyboard focus, selected), empty (−1) at first
 */
function makeSlots(): Array<LiftedBuilding> {
  return [0, 1, 2, 3].map((index) => ({
    id: -1,
    offset: [0, 0],
    shadow: [...buildingShadowOffset],
    squash: [1, 1],
    focused: index === 2,
    selected: index === 3,
    only: { ids: [-1, -1, -1, -1] },
  }))
}
