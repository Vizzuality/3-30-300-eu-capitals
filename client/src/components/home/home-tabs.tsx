import { getRouteApi } from "@tanstack/react-router"
import { motion } from "motion/react"
import { useState, type ReactNode } from "react"
import { useTranslations } from "use-intl"

import { AzList } from "@/components/az-list/az-list"
import { Ranking } from "@/components/ranking/ranking"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"
import { useCapitals, useRanking } from "@/data/queries"
import type { Capital, Ranking as RankingData } from "@/data/schemas"
import { motionDetails, motionTokens } from "@/design/tokens"
import { toReducedFade, transitions } from "@/design/tokens-motion"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { homeTabs, type HomeTab } from "@/lib/home-search"

/*
 * Home's two tabs, directly under the guide: the ranking of the capitals
 * (open by default) and the A–Z list, to find one. The tab open is in the
 * address (`?tab=az`), so it survives a reload and the browser's back button
 * returns to the other one. Both come from data already loaded with the
 * page: switching never fetches anything.
 */

const home = getRouteApi("/$locale/")

function isHomeTab(value: unknown): value is HomeTab {
  return (homeTabs as ReadonlyArray<unknown>).includes(value)
}

/**
 * The content of the tab just opened, floating up into place (Float), as
 * the panel's content does; a plain fade under reduced motion. The tab open
 * when the page arrives is shown as it is.
 */
function TabArrival({
  arriving,
  children,
}: {
  arriving: boolean
  children: ReactNode
}) {
  const reduced = usePrefersReducedMotion()

  return (
    <motion.div
      data-slot="tab-content"
      initial={
        arriving
          ? { opacity: 0, y: reduced ? 0 : motionDetails.floatRise }
          : false
      }
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduced ? toReducedFade(motionTokens.float.duration) : transitions.float
      }
    >
      {children}
    </motion.div>
  )
}

/** The tabs with `tab` open, telling `onTabChange` when another is chosen */
export function HomeTabsView({
  tab,
  onTabChange,
  ranking,
  capitals,
}: {
  tab: HomeTab
  onTabChange: (tab: HomeTab) => void
  ranking: RankingData
  capitals: Array<Capital>
}) {
  const t = useTranslations("home.tabs")

  // Each tab opened after the first floats in
  const [firstTab] = useState(tab)
  const [changed, setChanged] = useState(false)
  if (!changed && tab !== firstTab) {
    setChanged(true)
  }
  const arriving = changed || tab !== firstTab

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (isHomeTab(value)) {
          onTabChange(value)
        }
      }}
      className="flex flex-col gap-4.5"
    >
      <TabsList>
        <TabsTab value="ranking">{t("ranking")}</TabsTab>
        <TabsTab value="az">{t("az")}</TabsTab>
      </TabsList>
      <TabsPanel value="ranking">
        <TabArrival arriving={arriving}>
          <Ranking ranking={ranking} capitals={capitals} />
        </TabArrival>
      </TabsPanel>
      <TabsPanel value="az">
        <TabArrival arriving={arriving}>
          <AzList capitals={capitals} />
        </TabArrival>
      </TabsPanel>
    </Tabs>
  )
}

/**
 * The tabs on Home, from the release and the address: under the guide on
 * desktop, after the map band on phones. They arrive as the last part of the
 * panel's content.
 */
export function HomeTabs() {
  const ranking = useRanking()
  const { capitals } = useCapitals()
  const { tab } = home.useSearch()
  const navigate = home.useNavigate()

  return (
    <HomeTabsView
      tab={tab}
      // A new entry in the history, keeping the panel's scroll
      onTabChange={(next) =>
        navigate({ search: { tab: next }, resetScroll: false })
      }
      ranking={ranking}
      capitals={capitals}
    />
  )
}
