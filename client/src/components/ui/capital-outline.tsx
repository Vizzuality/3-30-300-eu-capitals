import { useMemo } from "react"

import type { Capital } from "@/data/schemas"
import { cn } from "@/lib/utils"
import { outlinePath } from "@/lib/outline"

/**
 * A capital's outline, the same shape as on the map, fitted to its box: drawn
 * in Surface, edged in Ink 2, or in Ink when its row is highlighted. The edge
 * keeps its width whatever the shape's size. Decorative: the row it sits in
 * names the capital.
 */
export function CapitalOutline({
  outline,
  highlighted = false,
  className,
}: {
  outline: Capital["outline"]
  highlighted?: boolean
  className?: string
}) {
  const { d, viewBox } = useMemo(() => outlinePath(outline), [outline])

  return (
    <svg
      viewBox={viewBox}
      aria-hidden="true"
      focusable="false"
      className={cn("block overflow-visible", className)}
    >
      <path
        d={d}
        fillRule="evenodd"
        strokeWidth={1.2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className={cn({
          "fill-surface transition-colors": true,
          "stroke-ink-2": !highlighted,
          "stroke-ink": highlighted,
        })}
      />
    </svg>
  )
}
