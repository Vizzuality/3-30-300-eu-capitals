import {
  motionDetails,
  motionTokens,
  type Curve,
  type EasedToken,
  type MotionToken,
  type SpringToken,
} from "./tokens.ts"

/**
 * A spring counts as settled once it stays within this fraction of the
 * distance from its target: the durations of the spring tokens are measured
 * to it.
 */
export const SETTLE_TOLERANCE = 0.002

/** A Motion spring defined by its duration and bounce (`type: "spring"`) */
export type MotionSpring = {
  type: "spring"
  /** In seconds */
  visualDuration: number
  bounce: number
}

/** A Motion tween along a cubic Bézier curve (`type: "tween"`) */
export type MotionTween = {
  type: "tween"
  /** In seconds */
  duration: number
  ease: [number, number, number, number]
}

/**
 * The damping ratio of a spring that overshoots by `overshoot` (a fraction of
 * the distance travelled): ζ = −ln(o) / √(π² + ln²(o)). A spring that does not
 * overshoot is critically damped.
 */
export function dampingRatio(overshoot: number) {
  if (overshoot <= 0) {
    return 1
  }
  const log = Math.log(overshoot)
  return -log / Math.sqrt(Math.PI ** 2 + log ** 2)
}

/**
 * The natural angular frequency, in radians per second, of a spring with this
 * damping ratio that settles in `duration` milliseconds: its oscillations
 * shrink as e^(−ζωt), so they fall within the tolerance when
 * ω = −ln(tolerance) / (ζ × duration).
 */
export function naturalFrequency(duration: number, ratio: number) {
  return -Math.log(SETTLE_TOLERANCE) / (ratio * (duration / 1000))
}

/*
 * Motion turns a spring's visual duration and bounce into physics (mass 1):
 * damping ratio ζ = 1 − bounce, natural frequency ω = 2π / (1.2 × visual
 * duration). The conversion below goes the other way, from the frequency and
 * damping ratio that give the token's duration and overshoot.
 */

/** A spring token as a Motion spring, from its duration and overshoot */
export function toMotionSpring(token: SpringToken): MotionSpring {
  const ratio = dampingRatio(token.overshoot)
  const frequency = naturalFrequency(token.duration, ratio)
  return {
    type: "spring",
    visualDuration: (2 * Math.PI) / (1.2 * frequency),
    bounce: 1 - ratio,
  }
}

/**
 * An eased token as a Motion tween. Tokens with a range accept a duration
 * within it (in milliseconds); anything outside is brought back to the range.
 */
export function toMotionTween(
  token: EasedToken,
  duration = token.duration
): MotionTween {
  const clamped = Math.min(
    Math.max(duration, token.duration),
    token.longest ?? token.duration
  )
  return { type: "tween", duration: clamped / 1000, ease: [...token.curve] }
}

/** Any token as a Motion transition */
export function toMotionTransition(token: MotionToken) {
  return token.kind === "spring" ? toMotionSpring(token) : toMotionTween(token)
}

/**
 * The fade that replaces an animation under reduced motion: the Fade curve,
 * never longer than the animation it replaces nor than the reduced-motion
 * limit
 */
export function toReducedFade(duration: number): MotionTween {
  return {
    type: "tween",
    duration: Math.min(duration, motionDetails.reducedFade) / 1000,
    ease: [...motionTokens.fade.curve],
  }
}

/**
 * The shape of a wobbling capital or building (Squash) at `progress`, from 0 to 1 along the
 * token's curve: its scales along its keyframes, in straight lines between
 * them. The curve shapes the whole wobble as one move, not each step.
 */
export function squashShape(progress: number) {
  const { times, x, y } = motionDetails.squashKeyframes
  const at = Math.min(Math.max(progress, 0), 1)
  const step = Math.max(
    0,
    times.findIndex((time, index) => at <= time && index > 0) - 1
  )
  const part = (at - times[step]) / (times[step + 1] - times[step])
  return {
    x: x[step] + (x[step + 1] - x[step]) * part,
    y: y[step] + (y[step + 1] - y[step]) * part,
  }
}

/** A curve as CSS, for transitions written in stylesheets */
export function toCssCurve([x1, y1, x2, y2]: Curve) {
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`
}

type MotionTokens = typeof motionTokens

/** Every motion token as a Motion transition */
export const transitions = Object.fromEntries(
  Object.entries(motionTokens).map(([name, token]) => [
    name,
    toMotionTransition(token),
  ])
) as {
  [Name in keyof MotionTokens]: MotionTokens[Name] extends SpringToken
    ? MotionSpring
    : MotionTween
}
