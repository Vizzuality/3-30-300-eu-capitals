import { Deck, MapController, type MapView } from "@deck.gl/core"

import type { ZoomLimits } from "@/map/camera"
import { easeZoom, isWheelNotch, wheelZoom } from "@/map/wheel-zoom"

/*
 * deck.gl as the site uses it: one instance for the life of the page, which
 * can stop drawing while the map is hidden (on Methodology), and gestures
 * that leave one finger to the page on the phone's map band.
 */

/**
 * A move that takes effect at once, as deck.gl's own gestures make: without
 * it, the view keeps the transition of the camera's last glide, and deck.gl
 * would glide to each frame of the wheel's easing
 */
const noTransition = { transitionDuration: 0 }

/** deck.gl's own way to say a gesture has stopped, which it keeps private */
type Interaction = {
  _setInteractionState: (state: {
    isZooming: boolean
    isPanning: boolean
  }) => void
}

/**
 * deck.gl's map gestures, except that:
 * - on the phone's map band one finger never moves the map: it scrolls the
 *   page (the canvas lets the browser scroll vertically), and two fingers
 *   move and pinch the map. A mouse still drags the map, whatever the
 *   window's width;
 * - a mouse wheel's notch zooms over a few frames, easing towards where the
 *   notches add up to, around the place under the pointer, instead of in
 *   one jump (deck.gl's `scrollZoom.smooth` starts each notch from where the
 *   last one has got to, so quick notches fall short, and it eases a
 *   trackpad's small steps too, which then lag behind the fingers). A
 *   trackpad's scroll and pinch stay deck.gl's, applied as they come.
 */
export class MapGestures extends MapController {
  private oneFingerScrolls = false
  private zoomLimits: ZoomLimits | undefined
  private wheel:
    | {
        // Where the pointer is, which stays put, where the zoom is (deck.gl
        // may hand the gestures its view a frame late) and where it goes
        pos: [number, number]
        zoom: number
        target: number
        frame: number
        time: number
      }
    | undefined

  override setProps(
    props: Parameters<MapController["setProps"]>[0] & {
      oneFingerScrolls?: boolean
      zoomLimits?: ZoomLimits
    }
  ) {
    this.oneFingerScrolls = Boolean(props.oneFingerScrolls)
    this.zoomLimits = props.zoomLimits
    // A move of the camera's own (a glide) takes over from the wheel
    if (this.wheel && Number(props.transitionDuration) > 0) {
      this.stopWheel()
    }
    super.setProps(props)
  }

  override finalize() {
    this.stopWheel()
    super.finalize()
  }

  // deck.gl's name for the start of a drag
  // oxlint-disable-next-line no-underscore-dangle
  protected override _onPanStart(event: { pointerType?: string }) {
    if (this.oneFingerScrolls && event.pointerType === "touch") {
      return false
    }
    this.stopWheel()
    // The event is the gesture deck.gl handed over, passed back unchanged
    // oxlint-disable-next-line no-underscore-dangle
    return super._onPanStart(event as never)
  }

  // deck.gl's name for a wheel event
  // oxlint-disable-next-line no-underscore-dangle
  protected override _onWheel(event: Parameters<MapController["_onWheel"]>[0]) {
    const step = event.srcEvent as WheelEvent
    if (!this.scrollZoom || !isWheelNotch(step)) {
      this.stopWheel()
      // oxlint-disable-next-line no-underscore-dangle
      return super._onWheel(event)
    }
    const centre = this.getCenter(event)
    if (!this.isPointInBounds(centre, event)) {
      return false
    }
    step.preventDefault()
    const pos = this.getZoomPosition(centre) as [number, number]
    const zoom = this.controllerState.getViewportProps().zoom
    // Notches add up from where the last one is going, around the pointer
    const from = this.wheel?.target ?? zoom
    const limits = this.zoomLimits
    const target = limits
      ? Math.min(
          limits.max,
          Math.max(limits.min, from + wheelZoom(event.delta))
        )
      : from + wheelZoom(event.delta)
    if (this.wheel) {
      this.wheel.target = target
      this.wheel.pos = pos
    } else {
      this.wheel = { pos, zoom, target, frame: 0, time: performance.now() }
      this.wheel.frame = requestAnimationFrame(this.easeWheel)
    }
    return true
  }

  private easeWheel = (now: number) => {
    const wheel = this.wheel
    if (!wheel) {
      return
    }
    // The place under the pointer is the same in every frame of the wheel,
    // so any of them, even one deck.gl has not handed back yet, can be
    // zoomed from: only its zoom is taken from the wheel's own
    const state = this.controllerState
    const from = state.getViewportProps().zoom
    const next = easeZoom(
      wheel.zoom,
      wheel.target,
      Math.max(0, now - wheel.time)
    )
    wheel.zoom = next
    wheel.time = now
    // On its last frame the zoom rests, and the camera can settle
    const landed = next === wheel.target
    this.updateViewport(
      state.zoom({ pos: wheel.pos, scale: 2 ** (next - from) }),
      noTransition,
      { isZooming: !landed, isPanning: !landed }
    )
    if (landed) {
      this.wheel = undefined
    } else {
      wheel.frame = requestAnimationFrame(this.easeWheel)
    }
  }

  private stopWheel() {
    if (!this.wheel) {
      return
    }
    cancelAnimationFrame(this.wheel.frame)
    this.wheel = undefined
    // The zoom stops where it is; what took over moves the camera now
    // oxlint-disable-next-line no-underscore-dangle
    ;(this as unknown as Interaction)._setInteractionState({
      isZooming: false,
      isPanning: false,
    })
  }
}

export class SiteDeck extends Deck<MapView> {
  private drawing = true

  /**
   * Starts or stops the render loop: while the map is hidden, nothing is
   * drawn and no frame is even asked for. Changes made meanwhile are drawn
   * as it starts again.
   */
  setDrawing(drawing: boolean) {
    if (drawing === this.drawing) {
      return
    }
    this.drawing = drawing
    if (drawing) {
      void this.animationLoop?.start()
      this.redraw("map shown")
    } else {
      this.animationLoop?.stop()
    }
  }

  get isDrawing() {
    return this.drawing
  }
}
