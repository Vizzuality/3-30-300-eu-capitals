/*
 * Zooming with a mouse wheel: each notch zooms by the amount deck.gl gives
 * it, but over a few frames rather than in one jump, easing towards where
 * the notches add up to, so the wheel feels smooth and still snappy. A
 * trackpad's scroll and pinch send many small steps, which already follow
 * the fingers: they are applied as they come.
 */

/** A wheel event, as far as zooming goes */
export type WheelStep = {
  /** 0 pixels, 1 lines, 2 pages */
  deltaMode: number
  deltaY: number
  /** Set by the browser for a trackpad's pinch */
  ctrlKey: boolean
}

/**
 * The smallest step, in pixels, that comes from a mouse wheel's notch
 * rather than a trackpad: a notch is 100 or 120 pixels in Chrome, or lines;
 * a trackpad sends a few pixels at a time
 */
const notchPixels = 50

/** Whether the step is a mouse wheel's notch, eased, or a trackpad's */
export function isWheelNotch({ deltaMode, deltaY, ctrlKey }: WheelStep) {
  return !ctrlKey && (deltaMode !== 0 || Math.abs(deltaY) >= notchPixels)
}

/**
 * How many zoom levels a wheel step zooms, in for a positive delta (the
 * wheel turned away) and out for a negative one, as deck.gl's map gestures
 * zoom it (`speed` 0.01): a 100 px notch zooms by about half a level.
 * `delta` is deck.gl's, in pixels, lines counted as 40 pixels.
 */
export function wheelZoom(delta: number, speed = 0.01) {
  const scale = 2 / (1 + Math.exp(-Math.abs(delta * speed)))
  return Math.sign(delta) * Math.log2(scale)
}

/**
 * How quickly the zoom eases towards its target: the distance left shrinks
 * by e every this many milliseconds, so a notch is 98% done in 180 ms
 */
export const wheelEasing = 45

/**
 * Closer than this, in zoom levels, the zoom lands on its target: a notch
 * lands in about 210 ms, the last step under 2 px a few hundred pixels from
 * the pointer
 */
const landing = 0.005

/** The zoom after `elapsed` milliseconds of easing towards the target */
export function easeZoom(zoom: number, target: number, elapsed: number) {
  const next = target + (zoom - target) * Math.exp(-elapsed / wheelEasing)
  return Math.abs(target - next) < landing ? target : next
}
