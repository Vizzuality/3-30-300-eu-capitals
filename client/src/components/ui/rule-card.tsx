import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

/*
 * Rule cards: the three rules side by side (3 trees in view, 30% canopy
 * around, 300 m to a park), each a figure over what it counts. Small hairline
 * cards, flat and still: they are not controls. On Home they introduce the
 * rule; the city overview adds each rule's share of residents under it.
 */

/** The cards, as a list in three equal columns, 8 px apart */
function RuleCards({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      data-slot="rule-cards"
      // Lists without bullets keep their list semantics in Safari
      // oxlint-disable-next-line jsx-a11y/no-redundant-roles
      role="list"
      className={cn("grid grid-cols-3 gap-2", className)}
      {...props}
    />
  )
}

/** One card: a hairline box, its content in a column */
function RuleCard({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      data-slot="rule-card"
      className={cn(
        "flex min-w-0 flex-col gap-0.5 rounded-control border border-line px-3.5 py-3",
        className
      )}
      {...props}
    />
  )
}

/** The rule's figure, in the title face ("3", "30%", "300 m") */
function RuleCardFigure({ children }: { children: ReactNode }) {
  return (
    <span className="font-serif text-figure wrap-break-word">{children}</span>
  )
}

/**
 * What the figure counts ("trees in view"); it wraps, breaking long words
 * where the language allows, so longer languages fit the card
 */
function RuleCardLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-small wrap-break-word hyphens-auto text-ink-2">
      {children}
    </span>
  )
}

/** The share of residents meeting the rule, under what it counts ("32%") */
function RuleCardShare({ children }: { children: ReactNode }) {
  return (
    <span className="mt-1.5 text-small font-semibold text-ink">{children}</span>
  )
}

export { RuleCard, RuleCardFigure, RuleCardLabel, RuleCardShare, RuleCards }
