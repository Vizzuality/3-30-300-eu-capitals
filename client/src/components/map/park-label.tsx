import { AnimatePresence, motion } from "motion/react"
import { useTranslations } from "use-intl"

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { overlayPresence } from "./overlay-motion"

/*
 * The name of the park a selected building's walk reaches, with rule 300:
 * a Surface pill with a green dot, above the end of the walk, written as on
 * the signs, in the capital's language ("Nearest park" when it has none).
 * It fades in once the walk has drawn itself and the park has lifted into
 * view, and fades out with the rule. The card says the same in words, so
 * screen readers skip it; street names keep clear of it.
 */

/** From the end of the walk to the label's middle, in pixels */
const above = 26

export function ParkLabel({
  name,
  language,
  x,
  y,
  visible,
  delay,
}: {
  /** The park's name; null when it has none */
  name: string | null
  /** The capital's language, for the name */
  language: string
  /** The end of the walk, in pixels from the map's top left corner */
  x: number
  y: number
  visible: boolean
  /** In seconds: after the walk and the park */
  delay: number
}) {
  const t = useTranslations("map")
  const reduced = usePrefersReducedMotion()

  return (
    <AnimatePresence>
      {visible && (
        <div
          key="park"
          aria-hidden="true"
          data-park-label=""
          data-map-obstacle=""
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: x, top: y - above }}
        >
          <motion.div
            {...overlayPresence("fade", reduced, reduced ? 0 : delay)}
            className="flex items-center gap-2 rounded-full bg-surface py-0.5 pr-3 pl-2 text-tag whitespace-nowrap text-ink shadow-lift"
          >
            <span className="size-2.5 flex-none rounded-full bg-tree" />
            {name === null ? (
              <span>{t("parkUnnamed")}</span>
            ) : (
              <span lang={language}>{name}</span>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
