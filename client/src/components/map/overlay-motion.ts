import type { TargetAndTransition, Transition } from "motion/react"

import { motionDetails, motionTokens } from "@/design/tokens"
import {
  toMotionTween,
  toReducedFade,
  transitions,
} from "@/design/tokens-motion"

/*
 * How the map's overlays arrive and leave, from the motion tokens:
 * - `float`: the pulse's tag and the hints rise 8 px into place (Float);
 * - `lift`: the Home label rises 3 px with its capital (Lift);
 * - `fade`: the legend and its content, and "Whole city", fade in (Fade).
 * Their opacity fades in with the Fade curve, so it never overshoots. Each
 * leaves with the panel's quick fade out (160 ms). Under reduced motion,
 * nothing moves: each arrives and leaves as a fade of at most 280 ms.
 */

export type OverlayArrival = "float" | "lift" | "fade"

const rises: Record<OverlayArrival, number> = {
  float: motionDetails.floatRise,
  lift: motionDetails.liftMap,
  fade: 0,
}

const durations: Record<OverlayArrival, number> = {
  float: motionTokens.float.duration,
  lift: motionTokens.lift.duration,
  fade: motionTokens.fade.duration,
}

const fadeIn = toMotionTween(motionTokens.fade)
const fadeOut: Transition = {
  type: "tween",
  duration: motionDetails.floatExit.duration / 1000,
  ease: [...motionDetails.floatExit.curve],
}

/** The `initial`, `animate` and `exit` props of an overlay */
export function overlayPresence(
  arrival: OverlayArrival,
  reduced: boolean,
  delay = 0
): {
  initial: TargetAndTransition
  animate: TargetAndTransition
  exit: TargetAndTransition
} {
  const rise = reduced ? 0 : rises[arrival]
  const enter: Transition = reduced
    ? { ...toReducedFade(durations[arrival]), delay }
    : {
        opacity: { ...fadeIn, delay },
        y:
          arrival === "fade"
            ? { duration: 0 }
            : { ...transitions[arrival], delay },
      }

  return {
    initial: { opacity: 0, y: rise },
    animate: { opacity: 1, y: 0, transition: enter },
    exit: {
      opacity: 0,
      transition: reduced
        ? toReducedFade(motionDetails.floatExit.duration)
        : fadeOut,
    },
  }
}
