import { AnimatePresence, motion, type Transition } from "motion/react"
import { useState } from "react"

import { motionDetails } from "@/design/tokens"
import { transitions } from "@/design/tokens-motion"
import { usePageVisible } from "@/hooks/use-page-visible"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { overlayPresence } from "./overlay-motion"

/*
 * The dot of the Next step guide's pulse on the map: a 16 px dot in Ink,
 * edged in the Surface colour, with the soft lift, at a place of the map.
 * It pops in where it is placed and fades out when it leaves. Every 3 s it
 * taps and sends out two rings (Nudge), three times after it is placed,
 * then rests; it pauses while the page is hidden, the nudge cut short
 * playing again when it is back. Under reduced motion it does not tap: it is
 * a still dot with one faint ring, and it only fades.
 *
 * It is drawn over the map, not in it: it leaves as soon as the map moves,
 * so it never has to follow the camera, and its taps never make the map
 * draw again. Its tag says what to do; screen readers hear the guide.
 */

// The tap in the first 22% of the cycle, then a rest
const tap = { scale: [...motionDetails.nudgeTap, 1] }
const tapTimes = [...motionDetails.nudgeTapTimes, 1]

// Each ring: shown in the first 8% of the cycle, spread and gone by 55%
const { from, to } = motionDetails.nudgeRingScale
const { shown, gone } = motionDetails.nudgeRingTimes
const ring = {
  scale: [from, to, to],
  opacity: [0, motionDetails.nudgeRingOpacity, 0, 0],
}

/** One nudge, a 3 s cycle; the first waits for the dot to settle in */
function nudgeTiming(first: boolean, after = 0): Transition {
  return {
    ...transitions.nudge,
    delay: (first ? motionDetails.nudgeDelay : 0) / 1000 + after / 1000,
  }
}

const ringClass =
  "pointer-events-none absolute -top-6 -left-6 size-12 rounded-full border-2 border-ink"

export function PulseDot({
  x,
  y,
  placed,
}: {
  /** Where it is, in pixels from the map's top left corner */
  x: number
  y: number
  /** A key for each time it is placed, which nudges again; none, it leaves */
  placed: string | undefined
}) {
  const reduced = usePrefersReducedMotion()

  return (
    <AnimatePresence>
      {placed !== undefined && (
        <motion.span
          key={placed}
          aria-hidden="true"
          data-pulse-dot=""
          className="pointer-events-none absolute"
          style={{ left: x, top: y }}
          {...overlayPresence("fade", reduced)}
        >
          {/* The room it takes, which the map's names keep clear of */}
          <span
            data-map-obstacle=""
            className={ringClass}
            style={{ opacity: 0 }}
          />
          <Pulse reduced={reduced} />
        </motion.span>
      )}
    </AnimatePresence>
  )
}

/**
 * The rings and the dot. Each nudge is a new element, so each plays its
 * whole cycle; three, while the page can be seen.
 */
function Pulse({ reduced }: { reduced: boolean }) {
  const visible = usePageVisible()
  const [played, setPlayed] = useState(0)
  const nudging = !reduced && visible && played < motionDetails.nudgeCount
  const first = played === 0
  const still = motionDetails.pulseStillRing

  return (
    <>
      {reduced && (
        <span
          className={ringClass}
          style={{ opacity: still.opacity, scale: still.scale }}
        />
      )}
      {nudging &&
        [0, motionDetails.nudgeRingApart].map((after, index) => (
          <motion.span
            // The two rings of this nudge, the second a little after the first
            // oxlint-disable-next-line react/no-array-index-key
            key={`ring-${played}-${index}`}
            className={ringClass}
            initial={{ scale: from, opacity: 0 }}
            animate={ring}
            transition={{
              scale: { ...nudgeTiming(first, after), times: [0, gone, 1] },
              opacity: {
                ...nudgeTiming(first, after),
                times: [0, shown, gone, 1],
              },
            }}
          />
        ))}
      {/* It pops in where it is placed, then taps */}
      <motion.span
        className="absolute -top-2 -left-2 block size-4"
        initial={reduced ? false : { scale: 0 }}
        animate={{ scale: 1 }}
        transition={transitions.pop}
      >
        <motion.span
          key={nudging ? `tap-${played}` : "still"}
          className="block size-4 rounded-full border-3 border-surface bg-ink shadow-lift"
          animate={nudging ? tap : { scale: 1 }}
          transition={
            nudging
              ? { ...nudgeTiming(first), times: tapTimes }
              : { duration: 0 }
          }
          onAnimationComplete={() => {
            if (nudging) {
              setPlayed((count) => count + 1)
            }
          }}
        />
      </motion.span>
    </>
  )
}
