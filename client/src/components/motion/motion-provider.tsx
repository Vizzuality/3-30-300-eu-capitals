import { MotionConfig } from "motion/react"
import type { ReactNode } from "react"

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"

/**
 * Applies the reduced-motion preference to every Motion animation: with it,
 * Motion skips transforms and layout animations and keeps the rest (opacity,
 * colours). Our own behaviours also swap their movements for short fades.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const reduced = usePrefersReducedMotion()

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      {children}
    </MotionConfig>
  )
}
