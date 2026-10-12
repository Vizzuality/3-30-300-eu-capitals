import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
  type MotionStyle,
  type TargetAndTransition,
  type Transition,
} from "motion/react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react"

import { toReducedFade, transitions } from "@/design/tokens-motion"
import { motionDetails, motionTokens } from "@/design/tokens"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { cn } from "@/lib/utils"

type Ring = { id: number; x: number; y: number }

/** Size of the click ring before it spreads, in pixels */
const RING_SIZE = 34

// The squash reaches its shape in this time, in milliseconds; the spring
// back (Press) does the rest
const SQUASH_IN = motionTokens.squashHeld.duration

/** The props `useTouchMotion` gives the element, a Motion component */
export type TouchMotionProps = {
  style: MotionStyle
  whileHover?: TargetAndTransition
  transition?: Transition
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onPointerLeave: () => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onKeyUp: (event: KeyboardEvent<HTMLElement>) => void
  onBlur: (event: FocusEvent<HTMLElement>) => void
}

/** Scales that squash and spring back with the element */
export type SquashScales = {
  scaleX: MotionValue<number>
  scaleY: MotionValue<number>
}

export type TouchMotionOptions = {
  /** Rise on hover (Lift) */
  lift?: boolean
  /** Squash while pressed, spring back when released (Squash held, Press) */
  press?: boolean
  /** One ring from the point pressed (Ring) */
  ring?: boolean
  /** Colour of the ring, as a border colour class (Ink by default) */
  ringClassName?: string
  /** Its shape when pressed (a button's by default, 1.04 × 0.94) */
  squashScale?: { x: number; y: number }
  /**
   * Something drawn with the element but outside it, which squashes and
   * springs back with it, in step: the highlight background of a list's row
   */
  squashWith?: SquashScales
}

// Keys that activate the element: Enter for links and buttons, Space for
// buttons only (on a link it scrolls the page)
function isActivationKey(event: KeyboardEvent<HTMLElement>) {
  return (
    event.key === "Enter" ||
    (event.key === " " && event.currentTarget.tagName !== "A")
  )
}

function isDisabled(element: HTMLElement) {
  return element.matches(":disabled, [aria-disabled='true']")
}

/**
 * How a row, chip, tab or button responds to the visitor: it rises 2 px under
 * the pointer (Lift); pressed with the pointer, Enter or Space, it squashes to
 * 1.04 × 0.94 (Squash held; a full-width list row, 1.01 × 0.94) and sends out
 * one ring from the point pressed (its centre with the keyboard), then
 * springs back when released (Press). Under reduced motion nothing moves: a
 * press shows one still ring that fades out.
 *
 * What the pointer hovers and presses never moves: the element itself takes
 * no pointer events, and a still hit area inside it, which undoes its rise
 * and its squash, takes them all, where the element is at rest. Otherwise a
 * pointer near an edge would find the element, then lose it as it moves
 * (rising away, or overshooting past its place as it drops back), and the
 * element would rise and drop under it over and over. The hit area is also
 * at least as large as the smallest touch target (40 px on desktop, 44 px on
 * phones), centred on the element, so these controls do not need
 * `hitTarget`. Hover styles, clicks and focus still reach the element, from
 * its hit area.
 *
 * A list's row squashes with its highlight background, which is drawn
 * outside it: the background's scales (`squashWith`) are animated with the
 * row's own, so the two move as one piece, like a button.
 *
 * Spread `props` on a Motion component (with Base UI, through its `render`
 * prop: `render={<motion.button {...touch.props} />}`) and put `layers`
 * inside it (the hit area and the rings). Router links get it through
 * `TouchLink`. The element needs `relative`, and no `overflow-hidden` if the
 * ring should spread beyond it.
 */
export function useTouchMotion({
  lift = true,
  press = true,
  ring = true,
  ringClassName = "border-ink",
  squashScale = motionDetails.squashHeldScale,
  squashWith,
}: TouchMotionOptions = {}) {
  const reduced = usePrefersReducedMotion()
  const y = useMotionValue(0)
  const scaleX = useMotionValue(1)
  const scaleY = useMotionValue(1)
  const [rings, setRings] = useState<Array<Ring>>([])

  const pressedAt = useRef<number | undefined>(undefined)
  const releaseTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const animations = useRef<Array<AnimationPlaybackControls>>([])
  const ringCount = useRef(0)
  // What squashes with the element, from the press to the spring back
  const pressedWith = useRef<SquashScales | undefined>(undefined)

  const run = useCallback((next: Array<AnimationPlaybackControls>) => {
    for (const animation of animations.current) {
      animation.stop()
    }
    animations.current = next
  }, [])

  useEffect(
    () => () => {
      clearTimeout(releaseTimer.current)
      run([])
    },
    [run]
  )

  // The element's own scales, and those squashing with it
  const squashing = (other: SquashScales | undefined) =>
    other ? [{ scaleX, scaleY }, other] : [{ scaleX, scaleY }]

  const start = (element: HTMLElement, point?: { x: number; y: number }) => {
    if (pressedAt.current !== undefined || isDisabled(element)) {
      return
    }
    pressedAt.current = performance.now()
    clearTimeout(releaseTimer.current)

    if (press && !reduced) {
      pressedWith.current = squashWith
      run(
        squashing(squashWith).flatMap((scales) => [
          animate(scales.scaleX, squashScale.x, transitions.squashHeld),
          animate(scales.scaleY, squashScale.y, transitions.squashHeld),
        ])
      )
    }

    if (ring) {
      const box = element.getBoundingClientRect()
      const id = ringCount.current++
      setRings((current) => [
        ...current,
        {
          id,
          x: point ? point.x - box.left : box.width / 2,
          y: point ? point.y - box.top : box.height / 2,
        },
      ])
    }
  }

  const end = () => {
    if (pressedAt.current === undefined) {
      return
    }
    // A quick press still shows the whole squash before springing back
    const held = performance.now() - pressedAt.current
    pressedAt.current = undefined
    if (!press || reduced) {
      return
    }
    releaseTimer.current = setTimeout(
      () =>
        run(
          squashing(pressedWith.current).flatMap((scales) => [
            animate(scales.scaleX, 1, transitions.press),
            animate(scales.scaleY, 1, transitions.press),
          ])
        ),
      Math.max(0, SQUASH_IN - held)
    )
  }

  const props: TouchMotionProps = {
    // Only the still hit area takes the pointer
    style: { y, scaleX, scaleY, pointerEvents: "none" },
    whileHover: lift && !reduced ? { y: -motionDetails.liftPanel } : undefined,
    transition: lift ? { y: transitions.lift } : undefined,
    onPointerDown: (event) => {
      if (event.button === 0 && event.isPrimary) {
        start(event.currentTarget, { x: event.clientX, y: event.clientY })
      }
    },
    onPointerUp: end,
    onPointerCancel: end,
    onPointerLeave: end,
    onKeyDown: (event) => {
      if (!event.repeat && isActivationKey(event)) {
        start(event.currentTarget)
      }
    },
    onKeyUp: (event) => {
      if (isActivationKey(event)) {
        end()
      }
    },
    onBlur: end,
  }

  return {
    props,
    layers: (
      <>
        <StillHitArea y={y} scaleX={scaleX} scaleY={scaleY} />
        <TouchRings
          rings={rings}
          reduced={reduced}
          className={ringClassName}
          onDone={(id) =>
            setRings((current) => current.filter((item) => item.id !== id))
          }
        />
      </>
    ),
  }
}

/**
 * The hit area of a touched element, which stays still while the element
 * rises and squashes: the element is drawn moved by `y` then scaled, so the
 * hit area, inside it, is scaled back then moved back by `y` (in the scaled
 * space, hence divided by the scale). Invisible, it only catches the pointer.
 */
function StillHitArea({
  y,
  scaleX,
  scaleY,
}: {
  y: MotionValue<number>
  scaleX: MotionValue<number>
  scaleY: MotionValue<number>
}) {
  const backY = useTransform([y, scaleY], ([rise, scale]: Array<number>) =>
    scale === 0 ? 0 : -rise / scale
  )
  const backScaleX = useTransform(scaleX, (scale) => 1 / scale)
  const backScaleY = useTransform(scaleY, (scale) => 1 / scale)

  return (
    <motion.span
      aria-hidden="true"
      data-slot="hit-area"
      // Disabled controls ignore the pointer, their hit area too
      className="pointer-events-auto absolute top-1/2 left-1/2 size-full min-h-target min-w-target -translate-x-1/2 -translate-y-1/2 in-data-disabled:pointer-events-none max-desktop:min-h-target-phone max-desktop:min-w-target-phone"
      style={{ y: backY, scaleX: backScaleX, scaleY: backScaleY }}
    />
  )
}

function TouchRings({
  rings,
  reduced,
  className,
  onDone,
}: {
  rings: Array<Ring>
  reduced: boolean
  className: string
  onDone: (id: number) => void
}) {
  if (rings.length === 0) {
    return null
  }

  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {rings.map(({ id, x, y }) => (
        <motion.span
          key={id}
          className={cn("absolute rounded-full border-2", className)}
          style={{
            left: x - RING_SIZE / 2,
            top: y - RING_SIZE / 2,
            width: RING_SIZE,
            height: RING_SIZE,
          }}
          // Under reduced motion, a still ring that fades out
          initial={
            reduced
              ? { opacity: motionDetails.ringOpacity / 2 }
              : {
                  scale: motionDetails.ringScale.from,
                  opacity: motionDetails.ringOpacity,
                }
          }
          animate={
            reduced
              ? { opacity: 0 }
              : { scale: motionDetails.ringScale.to, opacity: 0 }
          }
          transition={
            reduced
              ? toReducedFade(motionTokens.ring.duration)
              : transitions.ring
          }
          onAnimationComplete={() => onDone(id)}
        />
      ))}
    </span>
  )
}
