import { Fragment } from "react"
import { useTranslations } from "use-intl"

import { ExternalLink } from "@/components/ui/external-link"
import { hitTarget } from "@/components/ui/hit-target"
import type { Source } from "@/lib/credits"
import { mapAttribution, type AttributionMap } from "@/lib/map-attribution"
import { cn } from "@/lib/utils"

/*
 * The map's attribution, bottom left: the sources the map is drawn from
 * (see `mapAttribution`), each linked to its page, on a translucent Surface.
 * Always shown, never collapsed, on one line: the map gives each source a
 * short name ("© OpenStreetMap", "Overture"), so the line fits the
 * narrowest phone band (320 px). The About page holds every credit in full. Like every text link, its
 * links do not move.
 */
export function MapAttribution({
  map,
  sources,
  className,
}: {
  map: AttributionMap
  /** The release's sources (`sources.json`) */
  sources: ReadonlyArray<Source | undefined>
  className?: string
}) {
  const t = useTranslations("map.attribution")
  const items = mapAttribution(map, sources)

  if (items.length === 0) {
    return null
  }

  return (
    <p
      className={cn(
        "w-fit rounded-full bg-surface/88 px-2.5 py-1 text-attribution whitespace-nowrap text-ink-2",
        className
      )}
    >
      <span className="sr-only">{t("label")} </span>
      {items.map(({ id, url }, index) => (
        <Fragment key={id}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          <ExternalLink
            href={url}
            className={cn(
              "relative underline decoration-line underline-offset-2 transition-colors hover:text-ink hover:decoration-current",
              hitTarget
            )}
          >
            {t(`sources.${id}`)}
          </ExternalLink>
        </Fragment>
      ))}
    </p>
  )
}
