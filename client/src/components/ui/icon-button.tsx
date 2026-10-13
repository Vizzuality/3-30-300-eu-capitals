import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { motion } from "motion/react"

import { useTouchMotion } from "@/components/motion/use-touch-motion"
import { cn } from "@/lib/utils"

/*
 * Round buttons holding only an icon. In the panel, a hairline circle of
 * 40 px (close); on the map, a 44 px circle floating with the soft lift (zoom
 * in and out). On phones the panel's circle is still drawn at 40 px, but its
 * hit area grows to 44 px.
 */
const iconButtonVariants = cva(
  [
    "relative inline-grid shrink-0 place-items-center rounded-full bg-surface text-ink transition-colors select-none",
    "data-disabled:pointer-events-none data-disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        panel: "size-target border border-line hover:bg-surface-2",
        map: "size-target-phone shadow-lift hover:bg-surface-2",
      },
    },
    defaultVariants: {
      variant: "panel",
    },
  }
)

/**
 * An icon button: `label` is its accessible name, from the messages; the
 * icon inside is decorative. It responds like every button (see
 * `useTouchMotion`).
 */
function IconButton({
  label,
  className,
  variant = "panel",
  children,
  ...props
}: Omit<ButtonPrimitive.Props, "aria-label" | "className"> &
  VariantProps<typeof iconButtonVariants> & {
    label: string
    className?: string
  }) {
  const touch = useTouchMotion()

  return (
    <ButtonPrimitive
      data-slot="icon-button"
      aria-label={label}
      className={cn(iconButtonVariants({ variant, className }))}
      render={<motion.button {...touch.props} />}
      {...props}
    >
      {children}
      {touch.layers}
    </ButtonPrimitive>
  )
}

export { IconButton, iconButtonVariants }
