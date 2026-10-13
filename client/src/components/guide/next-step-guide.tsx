import { motion, type Transition } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { useTranslations } from "use-intl"

import { PointerIcon } from "@/components/icons"
import { motionDetails, motionTokens } from "@/design/tokens"
import { toReducedFade, transitions } from "@/design/tokens-motion"
import { usePageVisible } from "@/hooks/use-page-visible"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import {
  guideText,
  pathDots,
  type GuideState,
  type PathDot,
  type PointerKind,
} from "@/lib/guide"
import { cn } from "@/lib/utils"

/*
 * The Next step guide: a block filled in Ink with Surface text, the only one
 * in the interface, so it is the first thing the eye finds. It holds a
 * pointer, the step label ("Next · 2 of 3"), the sentence saying what to do
 * and three dots for the path City → Street → Building.
 *
 * Every 3 s its pointer taps and sends out one ring (Nudge), three times,
 * then it rests. When the visitor does what it says, the guide floats in with
 * the next step (Float) and nudges three times again. It pauses while the tab
 * is hidden (the nudges left play when it is back), and stays still under
 * reduced motion.
 *
 * Screen readers hear it change: it is a polite live region. It only speaks
 * for changes within a page. On a new page, the guide arrives with the rest
 * of the content and the page's name is announced instead (see
 * `RouteAnnouncer`): its region stays silent until it is in place, so the two
 * never pile up. Its text is still read like the rest of the page.
 */

/**
 * One nudge, a 3 s cycle: the first waits for the guide to float into place,
 * the next ones follow straight on
 */
function nudgeTiming(first: boolean) {
  return {
    ...transitions.nudge,
    delay: first ? motionDetails.nudgeDelay / 1000 : 0,
  }
}

// The tap in the first 22% of the cycle, then a rest
const tap = { scale: [...motionDetails.nudgeTap, 1] }
const tapTransition = (first: boolean): Transition => ({
  ...nudgeTiming(first),
  times: [...motionDetails.nudgeTapTimes, 1],
})

// The ring: shown in the first 8% of the cycle, spread and gone by 55%
const { from, to } = motionDetails.nudgeRingScale
const { shown, gone } = motionDetails.nudgeRingTimes
const ring = {
  scale: [from, to, to],
  opacity: [0, motionDetails.nudgeRingOpacity, 0, 0],
}
const ringTransition = (first: boolean): Transition => ({
  scale: { ...nudgeTiming(first), times: [0, gone, 1] },
  opacity: { ...nudgeTiming(first), times: [0, shown, gone, 1] },
})

/**
 * The guide in a given state. "Click" or "Tap" follows how the device is
 * pointed at (both sentences are in the page and CSS shows one), unless
 * `pointer` sets it. `live: false` keeps it from being announced, for a copy
 * of a guide already on the page.
 */
export function NextStepGuide({
  state,
  pointer,
  live = true,
}: {
  state: GuideState
  pointer?: PointerKind
  live?: boolean
}) {
  const t = useTranslations("guide")
  const text = guideText(state, t)
  const dots = pathDots(state)
  const reduced = usePrefersReducedMotion()
  const visible = usePageVisible()

  // The first state is shown as it arrives with the page; each later one
  // floats in
  const [firstState] = useState(state)
  const [changed, setChanged] = useState(false)
  if (!changed && state !== firstState) {
    setChanged(true)
  }
  const arriving = changed || state !== firstState

  // Silent until the guide is in place, then announced when it changes: the
  // region becomes live two frames after its first content is in the page,
  // once the browser has passed that content on to screen readers
  const region = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        region.current?.setAttribute("aria-live", live ? "polite" : "off")
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [live])

  return (
    <div ref={region} aria-atomic="true">
      <motion.div
        key={state}
        data-guide-state={state}
        initial={
          arriving
            ? { opacity: 0, y: reduced ? 0 : motionDetails.floatRise }
            : false
        }
        animate={{ opacity: 1, y: 0 }}
        transition={
          reduced
            ? toReducedFade(motionTokens.float.duration)
            : transitions.float
        }
        className="flex items-center gap-3.5 rounded-control bg-ink px-4 py-3.5 text-surface"
      >
        <GuidePointer canNudge={!reduced && visible} />
        <p className="flex min-w-0 flex-1 flex-col gap-0.5 wrap-break-word">
          <span className="text-guide-step uppercase opacity-72">
            {text.label}
          </span>
          {pointer ? (
            <span className="text-guide">{text.sentence[pointer]}</span>
          ) : (
            <>
              <span className="text-guide touch:hidden">
                {text.sentence.click}
              </span>
              <span className="hidden text-guide touch:block">
                {text.sentence.tap}
              </span>
            </>
          )}
        </p>
        {dots.length > 0 && <GuidePath dots={dots} />}
      </motion.div>
    </div>
  )
}

/**
 * The pointer in its round well, tapping and sending out a ring (Nudge), a
 * few times, while `canNudge`. Each guide has its own pointer (the guide is
 * remounted for each step), so each step nudges from the start.
 */
function GuidePointer({ canNudge }: { canNudge: boolean }) {
  // The nudges played so far; one cut short (the tab hidden) plays again
  const [played, setPlayed] = useState(0)
  const nudging = canNudge && played < motionDetails.nudgeCount
  const first = played === 0

  return (
    <span
      aria-hidden="true"
      className="relative grid size-9.5 flex-none place-items-center rounded-full bg-surface/14"
    >
      {nudging && (
        <motion.span
          key={`ring-${played}`}
          className="absolute inset-0 rounded-full border-2 border-surface"
          initial={{ scale: from, opacity: 0 }}
          animate={ring}
          transition={ringTransition(first)}
        />
      )}
      <motion.span
        // A new element for each nudge, so each plays its whole cycle
        key={nudging ? `tap-${played}` : "still"}
        className="grid"
        animate={nudging ? tap : { scale: 1 }}
        transition={nudging ? tapTransition(first) : { duration: 0 }}
        onAnimationComplete={() => {
          if (nudging) {
            setPlayed((count) => count + 1)
          }
        }}
      >
        <PointerIcon />
      </motion.span>
    </span>
  )
}

/** The path's three dots: the steps done, the current one (longer), ahead */
function GuidePath({ dots }: { dots: Array<PathDot> }) {
  return (
    <span aria-hidden="true" className="flex flex-none items-center gap-1">
      {dots.map((dot, index) => (
        <span
          // The dots never move: each is one step of the path
          // oxlint-disable-next-line react/no-array-index-key
          key={index}
          className={cn({
            "block h-1.75 rounded-full": true,
            "w-1.75 bg-surface/28": dot === "ahead",
            "w-1.75 bg-surface/70": dot === "done",
            "w-4.5 bg-surface": dot === "current",
          })}
        />
      ))}
    </span>
  )
}
