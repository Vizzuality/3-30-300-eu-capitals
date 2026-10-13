import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { motion } from "motion/react"

import { useTouchMotion } from "@/components/motion/use-touch-motion"
import { cn } from "@/lib/utils"

/*
 * The buttons of the design. Flat in the panel (a hairline, Surface 2 on
 * hover); only the map's controls float, with the soft lift. Labels can wrap
 * onto a second line when a language needs it. An icon placed before the
 * label takes `data-icon="inline-start"`.
 *
 * The classes also style links that look like buttons: a link stays a link,
 * with `TouchLink` for the motion.
 */
const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center text-center text-control font-semibold text-ink transition-colors select-none",
    "data-disabled:pointer-events-none data-disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        // A hairline box on Surface, 40 px tall ("Vizzuality", "Code")
        secondary:
          "min-h-10 gap-1.5 rounded-control border border-line bg-surface px-4 py-2.5 hover:bg-surface-2",
        // No box until hovered ("All capitals", "Back to the map")
        quiet:
          "gap-1 rounded-row px-2.5 py-1.5 hover:bg-surface-2 has-data-[icon=inline-start]:pl-1",
        // A pill floating on the map, 44 px tall ("Whole city")
        map: "min-h-11 gap-2 rounded-full bg-surface px-4 py-3 shadow-lift hover:bg-surface-2 has-data-[icon=inline-start]:pl-3.25",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  }
)

/**
 * A button that responds to the visitor: it lifts on hover, squashes and
 * sends out a ring when pressed, and springs back when released (see
 * `useTouchMotion`)
 */
function Button({
  className,
  variant = "secondary",
  children,
  ...props
}: Omit<ButtonPrimitive.Props, "className"> &
  VariantProps<typeof buttonVariants> & { className?: string }) {
  const touch = useTouchMotion()

  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, className }))}
      render={<motion.button {...touch.props} />}
      {...props}
    >
      {children}
      {touch.layers}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
