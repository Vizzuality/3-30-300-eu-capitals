import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { motion } from "motion/react"

import { useTouchMotion } from "@/components/motion/use-touch-motion"
import { cn } from "@/lib/utils"

/*
 * Tabs, as on Home (Ranking, A–Z list), on Base UI's Tabs: the arrow keys
 * move between the tabs, Home and End go to the first and the last, and Enter
 * or Space opens the one in focus.
 */

/** Holds the tabs and their panels, and which one is open */
function Tabs(props: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" {...props} />
}

/**
 * The row of tabs: a Surface 2 track in which the open tab sits on Surface,
 * edged by a hairline. Tabs share the width and their labels can wrap.
 */
function TabsList({
  className,
  ...props
}: Omit<TabsPrimitive.List.Props, "className"> & { className?: string }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("flex gap-1 rounded-control bg-surface-2 p-1", className)}
      {...props}
    />
  )
}

/** One tab, which responds like a button (see `useTouchMotion`) */
function TabsTab({
  className,
  children,
  ...props
}: Omit<TabsPrimitive.Tab.Props, "className"> & { className?: string }) {
  const touch = useTouchMotion()

  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        "relative min-w-0 flex-1 rounded-tab px-3 py-2.25 text-center text-control text-ink-2 transition-colors select-none hover:text-ink data-disabled:pointer-events-none data-disabled:opacity-50 data-active:bg-surface data-active:text-ink data-active:ring-1 data-active:ring-line",
        className
      )}
      render={<motion.button {...touch.props} />}
      {...props}
    >
      {children}
      {touch.layers}
    </TabsPrimitive.Tab>
  )
}

/** The content of one tab, shown while it is open */
function TabsPanel(props: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-panel" {...props} />
}

export { Tabs, TabsList, TabsPanel, TabsTab }
