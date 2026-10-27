import { AnimatePresence, motion } from "motion/react"

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { overlayPresence } from "./overlay-motion"

/*
 * The small cross at the centre of the map, on the city overview, while the
 * map has the keyboard's focus: where Enter zooms in. Two Ink strokes on a
 * halo in the Surface colour, so it reads on every result colour and on the
 * water. It fades in and out (Fade). The key hint says what Enter does,
 * so screen readers skip it.
 */
export function CentreMark({ visible }: { visible: boolean }) {
  const reduced = usePrefersReducedMotion()

  return (
    <AnimatePresence>
      {visible && (
        <motion.span
          key="centre"
          aria-hidden="true"
          data-centre-mark=""
          data-map-obstacle=""
          {...overlayPresence("fade", reduced)}
          className="pointer-events-none absolute top-1/2 left-1/2 size-5.5 -translate-1/2"
        >
          {/* The halo, then the strokes over it */}
          <span className="absolute inset-x-0 top-2 h-1.5 rounded-full bg-surface" />
          <span className="absolute inset-y-0 left-2 w-1.5 rounded-full bg-surface" />
          <span className="absolute inset-x-0.5 top-2.5 h-0.5 rounded-full bg-ink" />
          <span className="absolute inset-y-0.5 left-2.5 w-0.5 rounded-full bg-ink" />
        </motion.span>
      )}
    </AnimatePresence>
  )
}
