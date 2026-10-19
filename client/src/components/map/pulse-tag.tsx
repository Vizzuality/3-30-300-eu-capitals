import { AnimatePresence, motion } from "motion/react"
import { useTranslations } from "use-intl"

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { pulseOf, type GuideState, type PointerKind } from "@/lib/guide"
import { cn } from "@/lib/utils"
import { overlayPresence } from "./overlay-motion"

/*
 * The tag of the Next step guide's pulse on the map: a short sentence in an
 * Ink pill, beside the pulse's dot ("Click to zoom in" on the city overview,
 * "Click a building" on the street). It follows the guide's state, so the
 * two always agree; Home and a selected building have no pulse, so no tag.
 * The dot and its rings are drawn by the map. The tag floats in just after
 * the dot (Float) and fades out when the pulse leaves; under reduced motion
 * it only fades. "Click" or "Tap" follows how the device is pointed at, as
 * in the guide. The guide says the same in words, so screen readers skip it.
 */

/** From the pulse's centre to the tag's left edge, in pixels */
export const pulseTagOffset = 22

// The tag waits for the dot to appear, in seconds
const DELAY = 0.3

export function PulseTag({
  state,
  x,
  y,
  pointer,
  visible = true,
}: {
  state: GuideState
  /** The pulse's centre, in pixels from the map's top left corner */
  x: number
  y: number
  /** Forces "Click" or "Tap"; otherwise it follows the device */
  pointer?: PointerKind
  /** Whether the pulse is on the map: it leaves once the map is moved */
  visible?: boolean
}) {
  const t = useTranslations("map.pulse")
  const reduced = usePrefersReducedMotion()
  const pulse = pulseOf(state)
  const pill =
    "rounded-full bg-ink px-3 py-1.5 whitespace-nowrap text-tag text-surface shadow-lift"

  return (
    <AnimatePresence>
      {pulse && visible && (
        <div
          key={pulse}
          aria-hidden="true"
          data-pulse-tag={pulse}
          className="pointer-events-none absolute -translate-y-1/2"
          style={{ left: x + pulseTagOffset, top: y }}
        >
          <motion.div {...overlayPresence("float", reduced, DELAY)}>
            {pointer ? (
              <span className={cn("block", pill)}>
                {t(`${pulse}.${pointer}`)}
              </span>
            ) : (
              <>
                <span className={cn("block touch:hidden", pill)}>
                  {t(`${pulse}.click`)}
                </span>
                <span className={cn("hidden touch:block", pill)}>
                  {t(`${pulse}.tap`)}
                </span>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
