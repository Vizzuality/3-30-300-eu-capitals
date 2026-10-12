/*
 * The tween helper: animates a number, or an array of numbers, from A to B
 * with the curve or the spring of a motion token, frame by frame, so the map
 * can drive its layers with the same motion as the panel. Motion does the
 * animating; this only turns a token into Motion's transition and applies
 * reduced motion. It knows nothing of React.
 */
import { animate, mix } from "motion"

import { prefersReducedMotion } from "./reduced-motion.ts"
import {
  toMotionTransition,
  toMotionTween,
  toReducedFade,
  type MotionSpring,
  type MotionTween,
} from "./tokens-motion.ts"
import { motionTokens } from "./tokens.ts"

export type MotionTokenName = keyof typeof motionTokens

/** A value the helper can animate */
export type Tweenable = number | ReadonlyArray<number>

/**
 * The transition a tween runs: the token's own (eased tokens with a range
 * take a duration within it), or under reduced motion a fade of at most
 * 280 ms, or nothing at all when there is nothing to fade
 */
export function tweenTransition(
  name: MotionTokenName,
  {
    duration,
    reducedMotion,
    fades,
  }: { duration?: number; reducedMotion: boolean; fades: boolean }
): MotionSpring | MotionTween {
  const token = motionTokens[name]
  if (reducedMotion) {
    return toReducedFade(fades ? (duration ?? token.duration) : 0)
  }
  return token.kind === "eased" && duration !== undefined
    ? toMotionTween(token, duration)
    : toMotionTransition(token)
}

export type TweenOptions<Value extends Tweenable> = {
  from: Value
  to: Value
  /** The motion token whose curve or spring the value follows */
  token: MotionTokenName
  /** For eased tokens with a range, in milliseconds */
  duration?: number
  /** In milliseconds */
  delay?: number
  onUpdate: (value: Value) => void
  /**
   * Under reduced motion, the value goes straight to `to` and this receives
   * an opacity from 0 to 1, so what changed can fade in instead of moving.
   * Without it, the change is immediate.
   */
  onFade?: (opacity: number) => void
  onComplete?: () => void
  /** Whether to reduce motion; the visitor's preference by default */
  reducedMotion?: boolean
}

export type Tween = {
  /** Stops the tween where it is; `onComplete` is not called */
  cancel: () => void
  /** Resolves with true once the tween completes, false if cancelled */
  finished: Promise<boolean>
}

/**
 * Animates a value from `from` to `to` with a token's curve or spring,
 * honouring reduced motion. Motion runs the token's progress from 0 to 1
 * (beyond 1 when a spring overshoots) and `mix` turns it into the value.
 */
export function tween<Value extends Tweenable>({
  from,
  to,
  token,
  duration,
  delay = 0,
  onUpdate,
  onFade,
  onComplete,
  reducedMotion = prefersReducedMotion(),
}: TweenOptions<Value>): Tween {
  const value = mix<Value>(from, to)
  let started = false
  let resolve: ((completed: boolean) => void) | undefined
  const finished = new Promise<boolean>((done) => {
    resolve = done
  })

  const controls = animate(0, 1, {
    ...tweenTransition(token, {
      duration,
      reducedMotion,
      fades: onFade !== undefined,
    }),
    delay: delay / 1000,
    onUpdate: (progress) => {
      if (!reducedMotion) {
        onUpdate(value(progress))
        return
      }
      // Under reduced motion the value takes its end state at once
      if (!started) {
        started = true
        onUpdate(to)
      }
      onFade?.(progress)
    },
    onComplete: () => {
      if (reducedMotion && !started) {
        onUpdate(to)
      }
      onComplete?.()
      resolve?.(true)
    },
  })

  return {
    cancel: () => {
      controls.stop()
      resolve?.(false)
    },
    finished,
  }
}
