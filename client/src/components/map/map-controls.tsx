import { AnimatePresence, motion } from "motion/react"
import { useState, type ComponentProps } from "react"
import { useTranslations } from "use-intl"

import { FrameIcon, MinusIcon, PlusIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { cn } from "@/lib/utils"
import { overlayPresence } from "./overlay-motion"

/*
 * The map's controls, top right: "Whole city" on a capital's page, above
 * zoom in and zoom out. They float with the soft lift, take their hover
 * colour and rise like other buttons, squash and send out a ring when
 * pressed. A zoom button at its limit is disabled (half opacity) but keeps
 * the keyboard's focus. The phone's map band has no zoom buttons (two
 * fingers pinch), only "Whole city". "Whole city" fades in and out with the
 * capital (Fade).
 */

type ExtraProps = Partial<ComponentProps<"button">> &
  Record<`data-${string}`, unknown>

export function MapControls({
  onZoomIn,
  onZoomOut,
  canZoomIn = true,
  canZoomOut = true,
  onWholeCity,
  layout = "responsive",
  buttonProps = {},
  className,
}: {
  onZoomIn: () => void
  onZoomOut: () => void
  /** False at the closest zoom */
  canZoomIn?: boolean
  /** False at the farthest zoom */
  canZoomOut?: boolean
  /** Shows "Whole city" (a capital's page), which calls it */
  onWholeCity?: () => void
  /**
   * The zoom buttons follow the layout: shown on desktop, left out on the
   * phone's map band; `desktop` or `phone` sets one
   */
  layout?: "responsive" | "desktop" | "phone"
  /** More props for each button, such as a state held still */
  buttonProps?: {
    wholeCity?: ExtraProps
    zoomIn?: ExtraProps
    zoomOut?: ExtraProps
  }
  className?: string
}) {
  const t = useTranslations("map")
  const reduced = usePrefersReducedMotion()
  const presence = overlayPresence("fade", reduced)

  // "Whole city" is shown as it is when the controls appear, and fades in
  // when it arrives later. Not with `AnimatePresence`'s `initial={false}`:
  // its children keep it for good, and pass it down to every animation
  // mounted inside them, so the button's press ring would start at its end
  // (already faded out) and never be seen.
  const [shownFirst] = useState(Boolean(onWholeCity))
  const [changed, setChanged] = useState(false)
  if (!changed && Boolean(onWholeCity) !== shownFirst) {
    setChanged(true)
  }

  return (
    <div className={cn("flex flex-col items-end gap-2", className)}>
      <AnimatePresence>
        {onWholeCity && (
          <motion.div
            key="whole-city"
            {...presence}
            initial={changed ? presence.initial : false}
          >
            <Button
              variant="map"
              onClick={onWholeCity}
              {...buttonProps.wholeCity}
            >
              <FrameIcon data-icon="inline-start" />
              {t("wholeCity")}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      <div
        className={cn({
          "flex flex-col gap-2": true,
          "max-desktop:hidden": layout === "responsive",
          hidden: layout === "phone",
        })}
      >
        <IconButton
          variant="map"
          label={t("zoomIn")}
          onClick={onZoomIn}
          disabled={!canZoomIn}
          focusableWhenDisabled
          {...buttonProps.zoomIn}
        >
          <PlusIcon />
        </IconButton>
        <IconButton
          variant="map"
          label={t("zoomOut")}
          onClick={onZoomOut}
          disabled={!canZoomOut}
          focusableWhenDisabled
          {...buttonProps.zoomOut}
        >
          <MinusIcon />
        </IconButton>
      </div>
    </div>
  )
}
