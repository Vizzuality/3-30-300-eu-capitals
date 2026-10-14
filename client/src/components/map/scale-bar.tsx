import { useTranslations } from "use-intl"

import { scaleBar } from "@/lib/scale-bar"
import { cn } from "@/lib/utils"

/*
 * The map's scale, bottom right at street level: a round distance in the
 * visitor's language ("50 m", "2 km": kilometres from 1 km on) above a
 * bar of that length, on a translucent Surface. It follows the camera as it
 * moves, so it has no motion of its own. Visual only: screen readers have
 * no use for it.
 */
export function ScaleBar({
  metresPerPixel,
  maxWidth,
  className,
}: {
  /** Metres in one CSS pixel at the centre of the map */
  metresPerPixel: number
  /** The widest the bar may be, in CSS pixels */
  maxWidth?: number
  className?: string
}) {
  const t = useTranslations("map")
  const bar = scaleBar(metresPerPixel, maxWidth)

  if (!bar) {
    return null
  }

  return (
    <div
      aria-hidden="true"
      data-scale-metres={bar.metres}
      className={cn(
        "inline-flex flex-col items-end gap-0.5 rounded-scale-bar bg-surface/88 px-2 pt-1 pb-1.5 text-scale-bar text-ink-2",
        className
      )}
    >
      {t("scale", { unit: bar.unit, value: bar.value })}
      <span
        className="block h-1.5 border-2 border-t-0 border-ink-2"
        style={{ width: bar.width }}
      />
    </div>
  )
}
