import { AnimatePresence, motion, useIsPresent } from "motion/react"
import { useState, type ReactNode } from "react"

import { motionDetails, motionTokens } from "@/design/tokens"
import { toReducedFade, transitions } from "@/design/tokens-motion"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { cn } from "@/lib/utils"

/*
 * Content that changes in place, as the panel's content does between pages:
 * when `swapKey` changes, the leaving content fades out in 160 ms, then the
 * new content floats up 8 px into place (Float). Both share one grid cell
 * while they swap, so what follows moves once, when the leaving content has
 * gone, rather than jumping as one leaves and the other arrives. Under
 * reduced motion both are plain fades.
 *
 * The first content is shown as it arrives with the page (the panel floats
 * it in); only later ones float in. Leaving content is inert: it can no
 * longer be focused or clicked while it fades.
 */
export function Swap({
  swapKey,
  className,
  children,
}: {
  swapKey: string
  className?: string
  children: ReactNode
}) {
  const reduced = usePrefersReducedMotion()
  // The first content arrives with the page; each later one floats in
  const [firstKey] = useState(swapKey)
  const [changed, setChanged] = useState(false)
  if (!changed && swapKey !== firstKey) {
    setChanged(true)
  }
  const arriving = changed || swapKey !== firstKey

  return (
    <div className={cn("grid", className)}>
      <AnimatePresence>
        <SwapPart key={swapKey} arriving={arriving} reduced={reduced}>
          {children}
        </SwapPart>
      </AnimatePresence>
    </div>
  )
}

// Leaving content fades out with the panel's exit curve
const fadeOut = {
  type: "tween",
  duration: motionDetails.floatExit.duration / 1000,
  ease: [...motionDetails.floatExit.curve],
} as const

function SwapPart({
  arriving,
  reduced,
  children,
}: {
  arriving: boolean
  reduced: boolean
  children: ReactNode
}) {
  const isPresent = useIsPresent()
  // The new content waits for the leaving one to fade out
  const delay = motionDetails.floatExit.duration / 1000

  return (
    <motion.div
      data-slot="swap-part"
      inert={!isPresent}
      className="col-start-1 row-start-1 min-w-0"
      initial={
        arriving
          ? { opacity: 0, y: reduced ? 0 : motionDetails.floatRise }
          : false
      }
      animate={{
        opacity: 1,
        y: 0,
        transition: {
          ...(reduced
            ? toReducedFade(motionTokens.float.duration)
            : transitions.float),
          delay,
        },
      }}
      exit={{
        opacity: 0,
        transition: reduced
          ? toReducedFade(motionDetails.floatExit.duration)
          : fadeOut,
      }}
    >
      {children}
    </motion.div>
  )
}
