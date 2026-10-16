import type { ComponentType, ReactNode } from "react"
import { useTranslations } from "use-intl"

import { CapitalHighlightProvider } from "@/components/home/capital-highlight"
import {
  PanelPart,
  PanelTransition,
} from "@/components/motion/panel-transition"
import { SiteMap } from "@/map/site-map"
import { MapArea, MapSlot, type MapAreaMode } from "./map-area"
import { RouteAnnouncer } from "./route-announcer"
import { SiteFooter } from "./site-footer"
import { TopBar } from "./top-bar"

/**
 * The frame every page shares. On desktop, the 480 px panel on the left (top
 * bar, scrolling content, pinned footer) and the map area on the right, with
 * no page scroll. On phones, one scrolling column: the top bar, the page's
 * content with the map band, then the footer.
 *
 * The document follows what each layout shows, so the keyboard and screen
 * readers meet things in the order they are seen:
 * - desktop: top bar, the page's content, footer, map area;
 * - phones: top bar, the page's content before the band, the band, the
 *   content after it, footer.
 * The map area is one element moved between the two slots (see `MapArea`).
 *
 * When the page changes (`pageKey`, its address), only the page's content
 * changes, with the panel's content change (see `PanelTransition`).
 */
export function SiteFrame({
  pageKey,
  mapArea,
  afterMapBand: AfterMapBand,
  children,
}: {
  pageKey: string
  mapArea: MapAreaMode
  afterMapBand?: ComponentType
  children: ReactNode
}) {
  const t = useTranslations("frame")

  return (
    // The map and the ranking highlight each other's capital
    <CapitalHighlightProvider>
      <div className="relative flex min-h-dvh flex-col bg-surface desktop:h-dvh desktop:min-h-0 desktop:bg-background">
        <a
          href="#main"
          className="sr-only z-20 rounded-control bg-ink text-control text-surface focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:px-4 focus:py-2.5"
        >
          {t("skipLink")}
        </a>
        <PanelTransition pageKey={pageKey} mapArea={mapArea}>
          {({ mapArea: shownMapArea, announcement }) => (
            <>
              <RouteAnnouncer message={announcement} />
              <div className="flex flex-1 flex-col desktop:min-h-0 desktop:w-panel desktop:border-r desktop:border-line desktop:bg-surface">
                <TopBar />
                <main
                  id="main"
                  tabIndex={-1}
                  className="flex flex-1 flex-col gap-block px-panel-inset-phone pt-1 pb-7 desktop:min-h-0 desktop:overflow-y-auto desktop:px-panel-inset desktop:pt-2"
                >
                  <PanelPart name="before" pageKey={pageKey}>
                    {children}
                  </PanelPart>
                  <MapSlot layout="phone" mode={shownMapArea} />
                  <PanelPart name="after" pageKey={pageKey}>
                    {AfterMapBand && <AfterMapBand />}
                  </PanelPart>
                </main>
                <SiteFooter />
              </div>
              <MapSlot layout="desktop" mode={shownMapArea} />
            </>
          )}
        </PanelTransition>
        <MapArea>
          <SiteMap />
        </MapArea>
      </div>
    </CapitalHighlightProvider>
  )
}
