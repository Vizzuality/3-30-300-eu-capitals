import { Radio } from "@base-ui/react/radio"
import { RadioGroup } from "@base-ui/react/radio-group"
import { motion } from "motion/react"
import type { ReactNode } from "react"

import { DashIcon, TickIcon } from "@/components/icons"
import { useTouchMotion } from "@/components/motion/use-touch-motion"
import { cn } from "@/lib/utils"

/*
 * Chips: a few options side by side, one chosen at a time, as in the rule
 * switcher of a selected building (3 · 30 · 300). They are a radio group on
 * Base UI: one Tab stop for the group, the arrow keys move to the next chip
 * and choose it, Space (or a click) chooses the chip in focus.
 */

/**
 * The group: equal columns, 8 px apart. It needs a name (`aria-label` or
 * `aria-labelledby`).
 */
function ChipGroup({
  className,
  ...props
}: Omit<RadioGroup.Props, "className"> & { className?: string }) {
  return (
    <RadioGroup
      data-slot="chip-group"
      className={cn(
        "grid auto-cols-[minmax(0,1fr)] grid-flow-col gap-2",
        className
      )}
      {...props}
    />
  )
}

/**
 * One chip: a hairline card on Surface, Surface 2 on hover; the chosen one
 * is edged in Ink (2 px). It responds like a button (see `useTouchMotion`).
 * Its content is its accessible name.
 */
function Chip({
  className,
  children,
  ...props
}: Omit<Radio.Root.Props, "className" | "nativeButton" | "render"> & {
  className?: string
}) {
  const touch = useTouchMotion()

  return (
    <Radio.Root
      data-slot="chip"
      // The 2 px edge of the chosen chip takes 1 px from its padding, so its
      // content stays in place
      className={cn(
        "relative flex min-w-0 flex-col items-start gap-px rounded-control border border-line bg-surface px-3 py-2.5 text-left text-ink transition-colors select-none hover:bg-surface-2 data-checked:border-2 data-checked:border-ink data-checked:px-2.75 data-checked:py-2.25 data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      nativeButton
      render={<motion.button type="button" {...touch.props} />}
      {...props}
    >
      {children}
      {touch.layers}
    </Radio.Root>
  )
}

/** The chip's figure, in the title face ("3", "30", "300") */
function ChipFigure({ children }: { children: ReactNode }) {
  return <span className="font-serif text-figure">{children}</span>
}

/** What the figure counts ("trees", "% canopy", "m to a park") */
function ChipUnit({ children }: { children: ReactNode }) {
  return <span className="text-figure-unit text-ink-2">{children}</span>
}

/** Met (a tick in a filled circle) or not met (a dash in a ring) */
function StatusMark({ met }: { met: boolean }) {
  return (
    <span
      className={cn({
        "grid size-[15px] flex-none place-items-center rounded-full": true,
        "bg-ink text-surface": met,
        "border-[1.4px] border-ink-2 text-ink-2": !met,
      })}
    >
      {met ? <TickIcon /> : <DashIcon />}
    </span>
  )
}

/** Whether the rule is met: its mark, then the words ("met", "not met") */
function ChipStatus({ met, children }: { met: boolean; children: ReactNode }) {
  return (
    <span
      className={cn({
        "mt-1.5 flex items-center gap-1.25 text-status": true,
        "text-ink": met,
        "font-medium text-ink-2": !met,
      })}
    >
      <StatusMark met={met} />
      {children}
    </span>
  )
}

export { Chip, ChipFigure, ChipGroup, ChipStatus, ChipUnit, StatusMark }
