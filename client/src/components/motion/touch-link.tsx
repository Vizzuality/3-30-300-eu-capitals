import { createLink } from "@tanstack/react-router"
import { motion, type HTMLMotionProps } from "motion/react"
import { forwardRef, type FocusEvent, type ReactNode } from "react"

import { cn } from "@/lib/utils"
import { useTouchMotion, type SquashScales } from "./use-touch-motion"

type TouchAnchorProps = Omit<HTMLMotionProps<"a">, "children"> & {
  children?: ReactNode
  /** Whether it rises on hover (Lift); ranking rows stay down */
  lift?: boolean
  /** Its shape when pressed (a button's by default) */
  squashScale?: { x: number; y: number }
  /** What squashes with it when pressed (see `useTouchMotion`) */
  squashWith?: SquashScales
}

/**
 * An anchor that responds like a button (see `useTouchMotion`): it lifts on
 * hover (unless `lift` is false), squashes and sends out a ring when pressed with the pointer or
 * Enter, and springs back. The router's own handlers (navigation, preloading)
 * are kept alongside ours. On its own, it is a button-like link that leaves
 * the site ("Vizzuality" on the About page).
 */
export const TouchAnchor = forwardRef<HTMLAnchorElement, TouchAnchorProps>(
  function TouchAnchor(
    {
      className,
      style,
      onBlur,
      lift = true,
      squashScale,
      squashWith,
      children,
      ...props
    },
    ref
  ) {
    const touch = useTouchMotion({ lift, squashScale, squashWith })

    return (
      <motion.a
        ref={ref}
        {...props}
        {...touch.props}
        style={{ ...style, ...touch.props.style }}
        onBlur={(event: FocusEvent<HTMLAnchorElement>) => {
          onBlur?.(event)
          touch.props.onBlur(event)
        }}
        className={cn("relative", className)}
      >
        {children}
        {touch.layers}
      </motion.a>
    )
  }
)

/** The router's `Link`, with the behaviours of what the visitor touches */
export const TouchLink = createLink(TouchAnchor)
