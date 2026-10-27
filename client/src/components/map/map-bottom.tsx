import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/*
 * The bottom of the map: the attribution on the left and the scale on the
 * right, on one row 14 px from the bottom, and the key hint centred above
 * that row, so it never covers them. On the phone's map band the row sits
 * above the band's fade into the page (52 px up), and the scale is left out.
 * Only the attribution's links take the pointer.
 */
/**
 * How far the bottom row sits from the bottom of the map, in pixels: the
 * `bottom-3.5` and `bottom-13` below, which a fitted city keeps clear of
 */
export const mapBottomRow = { desktop: 14, phone: 52 } as const

export function MapBottom({
  attribution,
  scale,
  keyHint,
  layout = "responsive",
}: {
  attribution: ReactNode
  /** The scale bar, at street level */
  scale?: ReactNode
  keyHint?: ReactNode
  /** Follows the layout; `desktop` or `phone` sets one */
  layout?: "responsive" | "desktop" | "phone"
}) {
  return (
    <div
      className={cn({
        "pointer-events-none absolute inset-x-map-inset flex flex-col items-center gap-2": true,
        "bottom-3.5 max-desktop:bottom-13": layout === "responsive",
        "bottom-3.5": layout === "desktop",
        "bottom-13": layout === "phone",
      })}
    >
      {keyHint && (
        <div className="flex max-w-full justify-center">{keyHint}</div>
      )}
      <div className="flex w-full items-end justify-between gap-2">
        <div data-map-obstacle="" className="pointer-events-auto min-w-0">
          {attribution}
        </div>
        {scale && (
          <div
            data-map-obstacle=""
            className={cn({
              "flex-none": true,
              "max-desktop:hidden": layout === "responsive",
              hidden: layout === "phone",
            })}
          >
            {scale}
          </div>
        )}
      </div>
    </div>
  )
}
