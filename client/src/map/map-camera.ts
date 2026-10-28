import type { MapViewState } from "@deck.gl/core"
import { useSyncExternalStore } from "react"

import { prefersReducedMotion } from "@/design/reduced-motion"
import { motionDetails } from "@/design/tokens"
import type { VisibleArea } from "@/lib/visible-area"

import {
  applyAction,
  cameraMove,
  constrain,
  fitArea,
  limitsFor,
  type CameraLimits,
  type Padding,
  type Size,
  zoomLimits,
  type CameraAction,
} from "./camera"

/*
 * The map's camera, shared by everything around the map: the overlays read
 * it (the scale, the zoom buttons' limits), the keys and buttons move it,
 * and the address follows it. The renderer (deck.gl, or the stand-in map of
 * the accessibility tests) carries out each move asked for, and reports
 * every camera it draws, so the camera is always the one on screen.
 *
 * It lives outside React: the camera changes on every frame of a move, and
 * only what reads it re-renders.
 */

/** Where to take the camera: an area to fit, or a camera as it is */
export type CameraTarget =
  | { area: VisibleArea; padding?: Padding }
  | { camera: MapViewState }

/** Who asked for a move: the visitor (written to the address), or the page */
export type MoveSource = "visitor" | "page"

/** A move for the renderer to make */
export type CameraRequest = {
  id: number
  camera: MapViewState
  /** In milliseconds; 0 jumps */
  duration: number
  /** A flight that rises and comes down, for far moves */
  flight: boolean
  /**
   * Under reduced motion, a jump made behind a quick dip of the map to a
   * faded map and back
   */
  dip: boolean
}

export type MapCameraState = {
  /** The camera on screen; undefined until the map has a size */
  camera: MapViewState | undefined
  size: Size
  /** Where the camera may go, for the map's size */
  limits: CameraLimits
  /** The last move asked for */
  request: CameraRequest | undefined
  /**
   * How many times the visitor has moved the map (a drag, a scroll, a pinch,
   * a key, a button or a click), for what leaves once the map is moved
   */
  visitorMoves: number
}

/** How long the camera must rest before the address follows it */
export const settleDelay = 400

export class MapCamera {
  state: MapCameraState = {
    camera: undefined,
    size: { width: 0, height: 0 },
    limits: zoomLimits.home,
    request: undefined,
    visitorMoves: 0,
  }

  /**
   * Called once the camera rests after the visitor moved it, with the
   * camera and the map's size then
   */
  onSettle: ((camera: MapViewState, size: Size) => void) | undefined

  private listeners = new Set<() => void>()
  // Where the move asked for ends, so keys pressed during it add up
  private target: MapViewState | undefined
  // A move asked for before the map had a size
  private waiting:
    | { target: CameraTarget; source: MoveSource; jump: boolean }
    | undefined
  private source: MoveSource = "page"
  // When the move asked for ends (its duration from when it was asked),
  // in milliseconds since 1970
  private moveEnds = 0
  private moved = false
  // Whether the renderer is still moving the camera (a drag, a pinch, a
  // glide), as it says
  private moving = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private requests = 0
  // The map's own limits, whatever its size
  private mapLimits: CameraLimits = zoomLimits.home

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private update(change: Partial<MapCameraState>) {
    this.state = { ...this.state, ...change }
    for (const listener of this.listeners) {
      listener()
    }
  }

  /** Where the camera is going: the end of the move under way, or where it is */
  get destination(): MapViewState | undefined {
    return this.target ?? this.state.camera
  }

  /** The map's size on screen, as it changes */
  setSize(size: Size) {
    if (
      size.width === this.state.size.width &&
      size.height === this.state.size.height
    ) {
      return
    }
    this.update({ size, limits: limitsFor(this.mapLimits, size) })
    if (this.waiting && hasSize(size)) {
      const { target, source, jump } = this.waiting
      this.waiting = undefined
      this.go(target, source, { jump })
    }
  }

  /** Where the camera of the map shown may go */
  setLimits(limits: CameraLimits) {
    if (limits !== this.mapLimits) {
      this.mapLimits = limits
      this.update({ limits: limitsFor(limits, this.state.size) })
    }
  }

  /**
   * Takes the camera to a target: it glides there (or flies, from far away),
   * or jumps under reduced motion (behind a quick dip of the map) and when
   * the map first appears. `jump` jumps at once, as when another city takes
   * the place of the one that has just sunk. A move asked for by the page
   * forgets the visitor's last moves, so they are never written to the next
   * page's address.
   */
  go(
    target: CameraTarget,
    source: MoveSource,
    { jump = false }: { jump?: boolean } = {}
  ) {
    const { size, camera: from } = this.state
    if (!hasSize(size)) {
      this.waiting = { target, source, jump }
      return
    }
    const fitted =
      "camera" in target
        ? target.camera
        : fitArea(target.area, size, target.padding)
    // Never past the map's limits, even for a tiny area in a shared address
    const camera = constrain(fitted, this.state.limits, size)
    if (source === "page") {
      this.forgetMoves()
    }
    const reduced = prefersReducedMotion()
    const move =
      from && !jump
        ? { ...cameraMove(from, camera, size, reduced), dip: reduced }
        : { duration: 0, flight: false, dip: false }
    this.request(camera, move, source)
  }

  /** A key or a button's move, from where the last one ends */
  act(action: CameraAction) {
    const from = this.target ?? this.state.camera
    if (!from) {
      return
    }
    const camera = constrain(
      applyAction(from, action, this.state.limits, this.state.size),
      this.state.limits,
      this.state.size
    )
    if (
      camera.longitude === from.longitude &&
      camera.latitude === from.latitude &&
      camera.zoom === from.zoom
    ) {
      return
    }
    const reduced = prefersReducedMotion()
    const move = cameraMove(from, camera, this.state.size, reduced)
    // Keys and buttons always glide, however far a zoom level goes
    this.request(camera, { ...move, flight: false, dip: reduced }, "visitor")
  }

  private request(
    camera: MapViewState,
    move: { duration: number; flight: boolean; dip: boolean },
    source: MoveSource
  ) {
    this.target = camera
    this.source = source
    // A dip jumps once the map has faded
    this.moveEnds =
      Date.now() + move.duration + (move.dip ? motionDetails.dip.down : 0)
    this.requests += 1
    this.update({
      request: { id: this.requests, camera, ...move },
      visitorMoves: this.state.visitorMoves + (source === "visitor" ? 1 : 0),
    })
  }

  /**
   * The camera the renderer has drawn: during a move asked for, or as the
   * visitor drags, scrolls or pinches (a `gesture`, which takes over from
   * any move)
   */
  report(camera: MapViewState, { gesture }: { gesture: boolean }) {
    if (gesture) {
      this.target = undefined
      this.source = "visitor"
      this.moveEnds = 0
    }
    if (this.source === "visitor") {
      this.moved = true
    }
    this.update({
      camera,
      visitorMoves: this.state.visitorMoves + (gesture ? 1 : 0),
    })
    this.waitToSettle()
  }

  /**
   * Whether the renderer is moving the camera: a drag, a scroll, a pinch or
   * a glide under way. The camera never rests before the move is over,
   * however far apart its frames are on a slow device.
   */
  setMoving(moving: boolean) {
    if (moving === this.moving) {
      return
    }
    this.moving = moving
    this.waitToSettle()
  }

  // The camera rests once nothing has moved it for a while, the renderer
  // has finished moving it, and the move asked for has had its time. A
  // last frame drawn later still settles again.
  private waitToSettle() {
    clearTimeout(this.timer)
    if (this.moved && !this.moving) {
      const left = Math.max(0, this.moveEnds - Date.now())
      this.timer = setTimeout(() => this.settle(), left + settleDelay)
    }
  }

  private settle() {
    const { camera, size } = this.state
    this.moved = false
    if (camera) {
      this.onSettle?.(camera, size)
    }
  }

  private forgetMoves() {
    clearTimeout(this.timer)
    this.moved = false
  }

  dispose() {
    clearTimeout(this.timer)
    this.listeners.clear()
  }
}

function hasSize({ width, height }: Size) {
  return width > 0 && height > 0
}

/**
 * A value read from the camera, re-rendering only when it changes; `read`
 * must return a value that compares equal while nothing it reads changes
 * (a number, a string)
 */
export function useMapCamera<Value>(
  store: MapCamera,
  read: (state: MapCameraState) => Value
) {
  return useSyncExternalStore(
    store.subscribe,
    () => read(store.state),
    () => read(store.state)
  )
}
