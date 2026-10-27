import { AnimatePresence, motion } from "motion/react"
import { useFormatter, useTranslations } from "use-intl"

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import {
  legendEntries,
  legendText,
  type LegendSwatch,
  type LegendView,
} from "@/lib/map-legend"
import { cn } from "@/lib/utils"
import { overlayPresence } from "./overlay-motion"

/*
 * The legend of the map's view, in one legend language (see
 * `legendEntries`). On the map it is a card floating top left, with the soft
 * lift; on phones it sits under the map band, without its card (`band`).
 * When the view or the rule changes, its content fades out and the new one
 * fades in (Fade); it fades away where the view has no legend (Home).
 */

const results = [
  "bg-result-0 text-on-result-0",
  "bg-result-1 text-on-result-1",
  "bg-result-2 text-on-result-2",
  "bg-result-3 text-on-result-3",
] as const

/** The figures 0 to 3 on the result colours */
function ResultChips() {
  const format = useFormatter()

  return (
    <span className="flex flex-none gap-0.5">
      {results.map((colors, rules) => (
        <span
          // The four chips never move
          // oxlint-disable-next-line react/no-array-index-key
          key={rules}
          className={cn(
            "grid size-4 place-items-center rounded-bar text-legend-figure",
            colors
          )}
        >
          {format.number(rules)}
        </span>
      ))}
    </span>
  )
}

// The soft outline shared by every canopy patch
const patch =
  "M5 3.5c3-2.4 7.5-2 10.5.2 3.4 2.4 4.6 6.4 2.3 8.8-2.6 2.6-8.4 2.6-11.6.6C3 11.1 2 6 5 3.5z"

// The park's stipple: dots in staggered rows
const stipple = [
  [4.5, 4.5],
  [9.5, 4.5],
  [14.5, 4.5],
  [19, 4.5],
  [7, 8],
  [12, 8],
  [17, 8],
  [4.5, 11.5],
  [9.5, 11.5],
  [14.5, 11.5],
  [19, 11.5],
] as const

/** A drawn swatch, 22 × 16 px, in the map's colours */
function SwatchShape({
  swatch,
}: {
  swatch: Exclude<LegendSwatch, { shape: "results" }>
}) {
  switch (swatch.shape) {
    case "dot":
      return (
        <circle
          cx="11"
          cy="8"
          r="4.5"
          strokeWidth="1.2"
          className="fill-tree stroke-tree-rim"
        />
      )
    case "patch":
      return (
        <path
          d={patch}
          fillOpacity={swatch.evidence ? 1 : 0.35}
          className="fill-tree"
        />
      )
    case "rectangle":
      return swatch.evidence ? (
        <rect x="1" y="1" width="20" height="14" rx="3" className="fill-tree" />
      ) : (
        <>
          <rect
            x="1"
            y="1"
            width="20"
            height="14"
            rx="3"
            className="fill-park"
          />
          <g opacity="0.65" className="fill-tree-rim">
            {stipple.map(([cx, cy]) => (
              <circle key={`${cx},${cy}`} cx={cx} cy={cy} r="0.9" />
            ))}
          </g>
        </>
      )
    case "ring":
      return (
        <circle
          cx="11"
          cy="8"
          r="6"
          fill="none"
          strokeWidth="1.6"
          className="stroke-ink"
        />
      )
    default:
      return (
        <path
          d="M3 8h16"
          fill="none"
          strokeLinecap="round"
          strokeWidth={{ facades: 4, facade: 5, route: 2.4 }[swatch.line]}
          strokeDasharray={swatch.line === "route" ? "0.1 4" : undefined}
          className={cn({
            "stroke-passes": swatch.line !== "route",
            "stroke-ink": swatch.line === "route",
          })}
        />
      )
  }
}

function Swatch({ swatch }: { swatch: LegendSwatch }) {
  if (swatch.shape === "results") {
    return <ResultChips />
  }
  return (
    <svg
      width="22"
      height="16"
      viewBox="0 0 22 16"
      aria-hidden="true"
      focusable="false"
      className="flex-none"
    >
      <SwatchShape swatch={swatch} />
    </svg>
  )
}

/** The legend of a view of the map; nothing where the view has none */
export function MapLegend({
  view,
  variant = "map",
  className,
}: {
  view: LegendView
  /** A card on the map, or plain under the phone's map band */
  variant?: "map" | "band"
  className?: string
}) {
  const t = useTranslations("map.legend")
  const reduced = usePrefersReducedMotion()
  const entries = legendEntries(view)
  // A new list for each set of entries, so it fades in as a whole
  const key = entries
    .map((entry) => `${entry.label.key}:${JSON.stringify(entry.swatch)}`)
    .join("|")
  const presence = overlayPresence("fade", reduced)

  return (
    <AnimatePresence initial={false}>
      {entries.length > 0 && (
        <motion.div
          key="legend"
          {...presence}
          data-map-obstacle=""
          className={cn({
            "w-fit max-w-95": true,
            "rounded-control bg-surface px-3.5 py-2.5 shadow-lift":
              variant === "map",
            [className ?? ""]: Boolean(className),
          })}
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.ul
              key={key}
              {...presence}
              aria-label={t("title")}
              className="flex flex-col gap-1.75"
            >
              {entries.map((entry) => (
                <li
                  key={entry.label.key}
                  className="flex items-center gap-2.5 text-small font-medium text-ink"
                >
                  <Swatch swatch={entry.swatch} />
                  <span className="min-w-0">{legendText(entry, t)}</span>
                </li>
              ))}
            </motion.ul>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
