import { animate, motion, useMotionValue } from "motion/react"
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type RefObject,
} from "react"

import type { SquashScales } from "@/components/motion/use-touch-motion"
import { motionDetails } from "@/design/tokens"
import { toReducedFade, transitions } from "@/design/tokens-motion"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import type { CapitalSlug } from "@/lib/capitals"

/*
 * The highlight of the lists of capitals (the ranking, the A–Z list, Other
 * capitals): the capital under the pointer, or in keyboard focus, sits on a
 * Surface 2 box edged by a hairline, and its outline is edged in Ink. The box
 * is one element behind the rows, which follows from row to row (Follow).
 * Rows do not rise on hover; pressed, they squash with the box, as one
 * piece, and send out a ring, like a button. Under reduced motion the box
 * does not move: it fades in on the row it lands on.
 *
 * Each row carries its capital's slug as `data-slug`, inside a container
 * that is `relative`.
 */

/** Who highlights a row: the pointer, or the keyboard */
type Source = "pointer" | "focus"

function findRow(container: HTMLElement | null, slug: string) {
  return container?.querySelector<HTMLElement>(`[data-slug="${slug}"]`)
}

/**
 * The highlight box, placed on the row of `at`, or fading out where it was
 * when no row is highlighted (or its row is gone). Its place comes from the
 * row's position in the list, so the panel's scrolling never moves it off
 * its row. It squashes about its centre, its row's, with `squash` (from
 * `useRowHighlight`), while its place and size follow (Follow).
 */
export function RowHighlight({
  container,
  at,
  squash,
}: {
  container: RefObject<HTMLElement | null>
  at: CapitalSlug | undefined
  squash: SquashScales
}) {
  const reduced = usePrefersReducedMotion()
  const y = useMotionValue(0)
  const height = useMotionValue(0)
  const opacity = useMotionValue(0)
  // The row the box was last placed on, and whether it has been placed yet
  const placed = useRef<CapitalSlug | undefined>(undefined)
  const isFirst = useRef(true)
  // The row highlighted now, if any
  const current = useRef(at)

  useLayoutEffect(() => {
    current.current = at
    const row = at ? findRow(container.current, at) : null
    const first = isFirst.current
    isFirst.current = false
    const fade = reduced
      ? toReducedFade(motionDetails.reducedFade)
      : transitions.follow

    if (!at || !row) {
      const controls = animate(opacity, 0, fade)
      return () => controls.stop()
    }

    const target = { y: row.offsetTop, height: row.offsetHeight }
    const moved = placed.current !== at
    const shown = placed.current !== undefined && opacity.get() > 0
    placed.current = at

    // A row highlighted from the start is shown as it is
    if (first) {
      y.jump(target.y)
      height.jump(target.height)
      opacity.jump(1)
      return
    }

    // From the row it was on to the new one
    if (shown && !reduced) {
      const controls = [
        animate(y, target.y, transitions.follow),
        animate(height, target.height, transitions.follow),
        animate(opacity, 1, transitions.follow),
      ]
      return () => {
        for (const control of controls) {
          control.stop()
        }
      }
    }

    // Arriving, or under reduced motion: it fades in where it lands
    y.jump(target.y)
    height.jump(target.height)
    if (moved) {
      opacity.jump(0)
    }
    const controls = animate(opacity, 1, fade)
    return () => controls.stop()
  }, [at, reduced, container, y, height, opacity])

  // Rows move and change height when the window, the text or the rows shown
  // change: the box follows its row, and fades out if the row is gone
  useEffect(() => {
    const element = container.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver(() => {
      const slug = current.current
      if (!slug) {
        return
      }
      const row = findRow(element, slug)
      if (row) {
        y.jump(row.offsetTop)
        height.jump(row.offsetHeight)
      }
      opacity.jump(row ? 1 : 0)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [container, y, height, opacity])

  return (
    <motion.span
      aria-hidden="true"
      data-slot="row-highlight"
      className="pointer-events-none absolute inset-x-0 top-0"
      style={{
        y,
        height,
        opacity,
        scaleX: squash.scaleX,
        scaleY: squash.scaleY,
      }}
    >
      <span className="absolute inset-0 rounded-row border border-line bg-surface-2" />
    </motion.span>
  )
}

/**
 * Which row is highlighted: the row under the pointer or the row in keyboard
 * focus, the latest of the two, or else `highlighted`, a capital highlighted
 * from elsewhere (the map) or at rest (the capital of the page, in Other
 * capitals). Spread `listProps` on the list's container and `rowProps(slug)`
 * on each row, and give `squash` to the `RowHighlight`: the row the box is
 * on, pressed, squashes it with it. `onPoint` hears which row the pointer
 * or the keyboard is on (none once they leave), for the map to follow.
 */
export function useRowHighlight(
  highlighted?: CapitalSlug,
  onPoint?: (slug: CapitalSlug | undefined) => void
) {
  const scaleX = useMotionValue(1)
  const scaleY = useMotionValue(1)
  const [squash] = useState<SquashScales>(() => ({ scaleX, scaleY }))
  const [hovered, setHovered] = useState<CapitalSlug>()
  const [focused, setFocused] = useState<CapitalSlug>()
  const [latest, setLatest] = useState<Source>("pointer")
  const active =
    latest === "focus" ? (focused ?? hovered) : (hovered ?? focused)

  const hot = active ?? highlighted

  const point = useEffectEvent((slug: CapitalSlug | undefined) =>
    onPoint?.(slug)
  )
  useEffect(() => {
    point(active)
  }, [active])
  useEffect(() => () => point(undefined), [])

  return {
    hot,
    squash,
    listProps: { onPointerLeave: () => setHovered(undefined) },
    rowProps: (slug: CapitalSlug) => ({
      // Only the row the box is on squashes it: a finger's tap, which does
      // not hover, squashes the row alone, as it does a quiet button
      squashWith: slug === hot ? squash : undefined,
      onPointerEnter: (event: PointerEvent<HTMLElement>) => {
        // Fingers do not hover: a tap opens the capital
        if (event.pointerType !== "touch") {
          setLatest("pointer")
          setHovered(slug)
        }
      },
      onFocus: (event: FocusEvent<HTMLElement>) => {
        // The keyboard's focus, not a click's
        if (event.currentTarget.matches(":focus-visible")) {
          setLatest("focus")
          setFocused(slug)
        }
      },
      onBlur: () =>
        setFocused((current) => (current === slug ? undefined : current)),
    }),
  }
}

/** The handlers of a row of the list (see `useRowHighlight`) */
export type RowHighlightProps = ReturnType<
  ReturnType<typeof useRowHighlight>["rowProps"]
>
