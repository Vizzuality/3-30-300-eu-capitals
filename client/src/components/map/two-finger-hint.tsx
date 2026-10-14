import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "use-intl"

import { HandIcon } from "@/components/icons"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { overlayPresence } from "./overlay-motion"

/*
 * The phone's "Use two fingers to move the map" hint. On the phone's map
 * band one finger scrolls the page; a one-finger sideways drag shows this
 * hint, centred on the band, for 2 s. An Ink pill with a hand, like the
 * guide's other hints: it floats in (Float) and fades out; under reduced
 * motion it only fades. It is said politely to screen readers as it shows.
 */

/** How long the hint stays, in milliseconds */
export const twoFingerHintDuration = 2000

/**
 * Whether the hint shows, and `show` to show it for 2 s (again from the
 * start if it already shows)
 */
export function useTwoFingerHint() {
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const show = useCallback(() => {
    clearTimeout(timer.current)
    setVisible(true)
    timer.current = setTimeout(() => setVisible(false), twoFingerHintDuration)
  }, [])

  return { visible, show }
}

export function TwoFingerHint({ visible }: { visible: boolean }) {
  const t = useTranslations("map")
  const reduced = usePrefersReducedMotion()

  return (
    // A live region, said politely
    <output>
      <AnimatePresence>
        {visible && (
          <motion.span
            key="hint"
            {...overlayPresence("float", reduced)}
            className="flex items-center gap-1.5 rounded-full bg-ink py-1.75 pr-3.5 pl-3 text-tag text-surface shadow-lift"
          >
            <HandIcon />
            {t("twoFingers")}
          </motion.span>
        )}
      </AnimatePresence>
    </output>
  )
}
