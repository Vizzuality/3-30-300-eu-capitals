import { AnimatePresence, motion } from "motion/react"
import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { useTranslations } from "use-intl"

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { labelPlacement } from "@/lib/label-placement"
import { wholePercent } from "@/lib/ranking"
import { overlayPresence } from "./overlay-motion"

/*
 * The label of the capital under the pointer (or in keyboard focus) on the
 * Home map: its name, its country and the share of its residents meeting
 * all three rules, rounded to a whole percent, in a card with the soft lift,
 * 12 px above the capital; below it near the top of the map, and slid
 * sideways near its edges, so it always stays inside the map (see
 * `labelPlacement`). It rises 3 px into place with its capital (Lift)
 * and fades out when the pointer leaves; under reduced motion it only
 * fades. Screen readers hear the capital from the map itself, so the label
 * is hidden from them.
 */

export type HoverLabelCapital = {
  /** In the visitor's language */
  name: string
  country: string
  /** The share of residents meeting all three rules, from 0 to 1 */
  share: number
}

const shareTags = {
  b: (chunks: ReactNode) => <b className="font-bold">{chunks}</b>,
}

export function HoverLabel({
  capital,
  x,
  y,
  bottom,
  map,
}: {
  /** The capital to label; none hides the label */
  capital: HoverLabelCapital | undefined
  /**
   * The point labelled, in pixels from the map's top left corner: the top
   * middle of the capital, and its lowest point (`bottom`), which the label
   * clears when it goes below
   */
  x: number
  y: number
  bottom?: number
  /** The size of the map, which the label stays inside */
  map: { width: number; height: number }
}) {
  return (
    <AnimatePresence>
      {capital && (
        <PlacedLabel
          key={capital.name}
          capital={capital}
          point={{ x, y, bottom }}
          map={map}
        />
      )}
    </AnimatePresence>
  )
}

function PlacedLabel({
  capital,
  point,
  map,
}: {
  capital: HoverLabelCapital
  point: { x: number; y: number; bottom?: number }
  map: { width: number; height: number }
}) {
  const t = useTranslations("map.hoverLabel")
  const reduced = usePrefersReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  // The label's own size, measured before it is painted, and again if its
  // text changes size (a font arriving)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }
    const measure = () =>
      setSize({ width: element.offsetWidth, height: element.offsetHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const { left, top } = labelPlacement(point, size, map)

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-hover-label=""
      className="pointer-events-none absolute w-max"
      style={{ left, top }}
    >
      <motion.div
        {...overlayPresence("lift", reduced)}
        className="flex flex-col gap-px rounded-control bg-surface px-3.5 py-2.5 whitespace-nowrap text-ink shadow-lift"
      >
        <span className="font-serif text-map-label">{capital.name}</span>
        <span className="text-small text-ink-2">{capital.country}</span>
        <span className="mt-1 text-control font-normal">
          {t.rich("share", {
            share: wholePercent(capital.share) / 100,
            ...shareTags,
          })}
        </span>
      </motion.div>
    </div>
  )
}
