/*
 * The Motion section of the kit page: every motion token played on a sample,
 * the behaviours of what the visitor touches, and a switch that simulates
 * reduced motion to compare both versions. Development only, not translated.
 */
import { cubicBezier, spring } from "motion"
import { animate, motion } from "motion/react"
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react"

import { floatIn } from "@/components/motion/panel-transition"
import { useTouchMotion } from "@/components/motion/use-touch-motion"
import { Button } from "@/components/ui/button"
import { simulateReducedMotion } from "@/design/reduced-motion"
import { motionDetails, motionTokens, type MotionToken } from "@/design/tokens"
import {
  squashShape,
  toCssCurve,
  toReducedFade,
  transitions,
} from "@/design/tokens-motion"
import { tween } from "@/design/tween"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { cn } from "@/lib/utils"

type TokenName = keyof typeof motionTokens

const tokenUses: Record<TokenName, string> = {
  lift: "Hover: rows, chips and buttons rise 2 px (3 px with a shadow on the map)",
  squashHeld:
    "A pressed button, chip, tab or link squashes to 1.04 × 0.94, a list row and its background to 1.01 × 0.94, held while pressed",
  squash:
    "A clicked capital or building on the map (from step 15) wobbles once: 1.06 × 0.931, then 0.976 × 1.03, then at rest",
  ring: "One ring spreading from the click point and fading",
  press: "Buttons and chips springing back after a press",
  glide: "Camera moves, the city growing into place",
  follow: "The ranking's highlight following the pointer from row to row",
  sink: "Capitals left behind drop 7 px, shrink and fade, rippling outwards",
  pop: "Buildings, trees and icons appearing, in waves 120 ms apart",
  draw: "Sight lines, the walking route and outlines being drawn",
  fade: "Spotlight veil, legends, canopy, the 500 m circle",
  float:
    "Panel content: leaving content fades out in 160 ms, the new content rises 8 px in up to three parts 50 ms apart",
  nudge:
    "The guide's pointer taps once and sends out a ring, every 3 s, three times per step",
}

const reducedVersions: Record<TokenName, string> = {
  lift: "No rise: only the hover colour changes",
  squashHeld: "No squash: one still ring fades out",
  squash: "No wobble: one still ring fades out",
  ring: "A still ring fades out",
  press: "No spring: one still ring fades out",
  glide: "No movement: the sample fades in at its end place",
  follow: "No movement: the highlight fades in on its row",
  sink: "Fades out where it is",
  pop: "Fades in, all at once",
  draw: "The line fades in, already drawn",
  fade: "The same fade, 280 ms at most",
  float: "Fades out, then fades in, all at once",
  nudge:
    "Still: the guide neither taps nor rings; the map's pulse (later) keeps one faint ring",
}

function formatToken(token: MotionToken) {
  const duration =
    token.kind === "eased" && token.longest
      ? `${token.duration}–${token.longest} ms`
      : `${token.duration} ms`
  if (token.kind === "spring") {
    return `${duration} · ${Math.round(token.overshoot * 100)}% overshoot · spring`
  }
  return `${duration} · ${toCssCurve(token.curve)}`
}

function formatMotion(name: TokenName) {
  const transition = transitions[name]
  if (transition.type === "spring") {
    return `{ type: "spring", visualDuration: ${transition.visualDuration.toFixed(3)}, bounce: ${transition.bounce.toFixed(3)} }`
  }
  return `{ duration: ${transition.duration}, ease: [${transition.ease.join(", ")}] }`
}

/**
 * The token's progress over time, sampled from Motion's own spring and curve
 * functions, as an SVG path; springs show their overshoot
 */
function curvePath(name: TokenName, width: number, height: number) {
  const token = motionTokens[name]
  const length = token.kind === "spring" ? token.duration * 1.2 : token.duration
  const transition = transitions[name]
  const progressAt =
    transition.type === "spring"
      ? (time: number) =>
          spring({ keyframes: [0, 1], ...transition }).next(time).value
      : (time: number) => cubicBezier(...transition.ease)(time / length)
  const points: Array<string> = []
  for (let step = 0; step <= 120; step++) {
    const time = (step / 120) * length
    const x = (time / length) * width
    const y = height - 6 - progressAt(time) * (height - 16)
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return `M${points.join("L")}`
}

function Curve({ name }: { name: TokenName }) {
  const width = 132
  const height = 56
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      className="shrink-0 overflow-visible"
    >
      <line
        x1={0}
        x2={width}
        y1={10}
        y2={10}
        className="stroke-line"
        strokeDasharray="3 3"
      />
      <line
        x1={0}
        x2={width}
        y1={height - 6}
        y2={height - 6}
        className="stroke-line"
      />
      <path
        d={curvePath(name, width, height)}
        fill="none"
        className="stroke-ink"
        strokeWidth={1.6}
      />
    </svg>
  )
}

type Player = (reduced: boolean) => void

/** One token: its values, its curve, a sample and a button to play it */
function TokenCard({
  name,
  sample,
  play,
}: {
  name: TokenName
  sample: ReactNode
  play: Player
}) {
  const reduced = usePrefersReducedMotion()
  const token = motionTokens[name]

  return (
    <article className="flex flex-col gap-3 rounded-control border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="font-serif text-heading capitalize">{name}</h3>
          <p className="text-small text-ink-2">{formatToken(token)}</p>
        </div>
        <Curve name={name} />
      </div>
      <p className="text-small">{tokenUses[name]}</p>
      <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-control bg-background">
        {sample}
      </div>
      <p className="font-mono text-[11px] leading-4 break-all text-ink-2">
        {formatMotion(name)}
      </p>
      <p className="text-small text-ink-2">
        Reduced motion: {reducedVersions[name]}
      </p>
      <Button onClick={() => play(reduced)}>
        Play {name}
        {reduced && " (reduced)"}
      </Button>
    </article>
  )
}

const sampleBox = "size-12 rounded-control bg-ink"

/** A still ring that fades out: what presses become under reduced motion */
function stillRing(host: HTMLElement) {
  const ring = document.createElement("span")
  ring.className =
    "pointer-events-none absolute top-1/2 left-1/2 -mt-[17px] -ml-[17px] size-[34px] rounded-full border-2 border-ink"
  host.append(ring)
  void animate(
    ring,
    { opacity: [motionDetails.ringOpacity / 2, 0] },
    toReducedFade(motionTokens.ring.duration)
  ).then(() => ring.remove())
}

function spreadingRing(host: HTMLElement) {
  const ring = document.createElement("span")
  ring.className =
    "pointer-events-none absolute top-1/2 left-1/2 -mt-[17px] -ml-[17px] size-[34px] rounded-full border-2 border-ink"
  host.append(ring)
  void animate(
    ring,
    {
      scale: [motionDetails.ringScale.from, motionDetails.ringScale.to],
      opacity: [motionDetails.ringOpacity, 0],
    },
    transitions.ring
  ).then(() => ring.remove())
}

function useElement<Element extends HTMLElement | SVGElement>() {
  return useRef<Element>(null)
}

function LiftCard() {
  const chip = useElement<HTMLSpanElement>()
  return (
    <TokenCard
      name="lift"
      sample={
        <span
          ref={chip}
          className="rounded-control border border-line bg-surface px-3 py-2 text-control"
        >
          Rule 3
        </span>
      }
      play={(reduced) => {
        const element = chip.current
        if (!element) {
          return
        }
        if (reduced) {
          void animate(
            element,
            { backgroundColor: ["var(--surface)", "var(--surface-2)"] },
            toReducedFade(motionTokens.lift.duration)
          ).then(() =>
            setTimeout(
              () => element.style.removeProperty("background-color"),
              600
            )
          )
          return
        }
        void animate(
          element,
          { y: -motionDetails.liftPanel },
          transitions.lift
        ).then(() =>
          setTimeout(() => animate(element, { y: 0 }, transitions.lift), 300)
        )
      }}
    />
  )
}

function SquashCard() {
  const box = useElement<HTMLDivElement>()
  return (
    <TokenCard
      name="squash"
      sample={<div ref={box} className={sampleBox} />}
      play={(reduced) => {
        const element = box.current
        if (!element?.parentElement) {
          return
        }
        if (reduced) {
          stillRing(element.parentElement)
          return
        }
        // One wobble along the curve, as a capital or a building clicked
        animate(0, 1, {
          ...transitions.squash,
          onUpdate: (progress) => {
            const { x, y } = squashShape(progress)
            element.style.transform = `scale(${x}, ${y})`
          },
        })
      }}
    />
  )
}

function SquashHeldCard() {
  const control = useElement<HTMLDivElement>()
  const row = useElement<HTMLDivElement>()
  return (
    <TokenCard
      name="squashHeld"
      sample={
        <div className="flex items-center gap-4">
          <div ref={control} className={sampleBox} />
          <div ref={row} className="h-10 w-40 rounded-row bg-ink" />
        </div>
      }
      play={(reduced) => {
        const pressed = [
          [control.current, motionDetails.squashHeldScale],
          [row.current, motionDetails.squashRowScale],
        ] as const
        for (const [element, { x, y }] of pressed) {
          if (!element?.parentElement) {
            continue
          }
          if (reduced) {
            stillRing(element.parentElement)
            continue
          }
          // Pressed for a moment, then released (Press)
          void animate(
            element,
            { scaleX: x, scaleY: y },
            transitions.squashHeld
          ).then(() =>
            setTimeout(
              () =>
                animate(element, { scaleX: 1, scaleY: 1 }, transitions.press),
              200
            )
          )
        }
      }}
    />
  )
}

function RingCard() {
  const host = useElement<HTMLDivElement>()
  return (
    <TokenCard
      name="ring"
      sample={<div ref={host} className="absolute inset-0" />}
      play={(reduced) => {
        if (host.current) {
          ;(reduced ? stillRing : spreadingRing)(host.current)
        }
      }}
    />
  )
}

function PressCard() {
  const box = useElement<HTMLDivElement>()
  return (
    <TokenCard
      name="press"
      sample={<div ref={box} className={sampleBox} />}
      play={(reduced) => {
        const element = box.current
        if (!element?.parentElement) {
          return
        }
        if (reduced) {
          stillRing(element.parentElement)
          return
        }
        // From the held squash back to rest
        const { x, y } = motionDetails.squashHeldScale
        animate(element, { scaleX: [x, 1], scaleY: [y, 1] }, transitions.press)
      }}
    />
  )
}

function GlideCard() {
  return <SlideCard name="glide" />
}

function FollowCard() {
  return <SlideCard name="follow" />
}

/** A dot sliding from one side to the other with an eased token */
function SlideCard({ name }: { name: "glide" | "follow" }) {
  const dot = useElement<HTMLDivElement>()
  const side = useRef(1)
  return (
    <TokenCard
      name={name}
      sample={
        <div
          ref={dot}
          className="size-6 rounded-full bg-ink"
          style={{ transform: "translateX(-80px)" }}
        />
      }
      play={(reduced) => {
        const element = dot.current
        if (!element) {
          return
        }
        const from = -80 * side.current
        side.current *= -1
        tween({
          from,
          to: -from,
          token: name,
          reducedMotion: reduced,
          onUpdate: (x) => {
            element.style.transform = `translateX(${x}px)`
          },
          onFade: (opacity) => {
            element.style.opacity = String(opacity)
          },
        })
      }}
    />
  )
}

function SinkCard() {
  const dots = useRef<Array<HTMLDivElement | null>>([])
  return (
    <TokenCard
      name="sink"
      sample={
        <div className="flex items-center gap-4">
          {[0, 1, 2, 3, 4].map((index) => (
            <div
              key={index}
              ref={(element) => {
                dots.current[index] = element
              }}
              className={cn({
                "size-5 rounded-full": true,
                "bg-ink": index === 2,
                "bg-result-2": index !== 2,
              })}
            />
          ))}
        </div>
      }
      play={(reduced) => {
        // The middle one is chosen; the others sink, rippling outwards
        dots.current.forEach((element, index) => {
          if (!element || index === 2) {
            return
          }
          const delay =
            (Math.abs(index - 2) - 1) * (motionDetails.sinkRipple / 2)
          const reset = () =>
            setTimeout(() => {
              element.style.transform = ""
              element.style.opacity = ""
            }, 700)
          void tween({
            from: [0, 1, 1],
            to: [motionDetails.sinkDrop, 0.85, 0],
            token: "sink",
            delay,
            reducedMotion: reduced,
            onUpdate: ([drop, scale, opacity]) => {
              element.style.transform = `translateY(${drop}px) scale(${scale})`
              element.style.opacity = String(opacity)
            },
            // Under reduced motion it only fades out, where it is
            onFade: (progress) => {
              element.style.transform = ""
              element.style.opacity = String(1 - progress)
            },
          }).finished.then(reset)
        })
      }}
    />
  )
}

function PopCard() {
  const squares = useRef<Array<HTMLDivElement | null>>([])
  return (
    <TokenCard
      name="pop"
      sample={
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div
              key={index}
              ref={(element) => {
                squares.current[index] = element
              }}
              className="size-7 rounded-bar bg-result-2"
            />
          ))}
        </div>
      }
      play={(reduced) => {
        squares.current.forEach((element, index) => {
          if (!element) {
            return
          }
          element.style.opacity = "0"
          const wave = index % motionDetails.popWaves.count
          tween({
            from: 0,
            to: 1,
            token: "pop",
            delay: reduced ? 0 : wave * motionDetails.popWaves.apart,
            reducedMotion: reduced,
            onUpdate: (scale) => {
              element.style.transform = `scale(${scale})`
              element.style.opacity = String(Math.min(1, scale * 2))
            },
            onFade: (opacity) => {
              element.style.transform = ""
              element.style.opacity = String(opacity)
            },
          })
        })
      }}
    />
  )
}

function DrawCard() {
  const path = useElement<SVGPathElement>()
  return (
    <TokenCard
      name="draw"
      sample={
        <svg viewBox="0 0 200 80" width={200} height={80} aria-hidden="true">
          <path
            ref={path}
            d="M10 60 C 50 10, 80 10, 100 40 S 160 70, 190 20"
            fill="none"
            className="stroke-ink"
            strokeWidth={3}
            strokeLinecap="round"
          />
        </svg>
      }
      play={(reduced) => {
        const element = path.current
        if (!element) {
          return
        }
        const length = element.getTotalLength()
        element.style.strokeDasharray = String(length)
        element.style.opacity = "1"
        tween({
          from: length,
          to: 0,
          token: "draw",
          reducedMotion: reduced,
          onUpdate: (offset) => {
            element.style.strokeDashoffset = String(offset)
          },
          onFade: (opacity) => {
            element.style.opacity = String(opacity)
          },
        })
      }}
    />
  )
}

function FadeCard() {
  const veil = useElement<HTMLDivElement>()
  return (
    <TokenCard
      name="fade"
      sample={
        <div
          ref={veil}
          className="size-16 rounded-full border-2 border-dashed border-ink bg-tree/30"
        />
      }
      play={(reduced) => {
        const element = veil.current
        if (!element) {
          return
        }
        element.style.opacity = "0"
        tween({
          from: 0,
          to: 1,
          token: "fade",
          reducedMotion: reduced,
          onUpdate: (opacity) => {
            element.style.opacity = String(opacity)
          },
          onFade: (opacity) => {
            element.style.opacity = String(opacity)
          },
        })
      }}
    />
  )
}

function FloatCard() {
  const content = useElement<HTMLDivElement>()
  return (
    <TokenCard
      name="float"
      sample={
        <div ref={content} className="flex w-48 flex-col gap-2">
          <div className="h-5 w-32 rounded-bar bg-ink" />
          <div className="h-3 w-full rounded-bar bg-ink-2/40" />
          <div className="h-3 w-40 rounded-bar bg-ink-2/40" />
        </div>
      }
      play={(reduced) => {
        const element = content.current
        if (!element) {
          return
        }
        // The leaving content fades out, then the new one floats in
        void animate(
          [...element.children],
          { opacity: [1, 0] },
          reduced
            ? toReducedFade(motionDetails.floatExit.duration)
            : {
                duration: motionDetails.floatExit.duration / 1000,
                ease: [...motionDetails.floatExit.curve],
              }
        ).then(() => floatIn(element, { delay: 0, firstPart: 0, reduced }))
      }}
    />
  )
}

function NudgeCard() {
  const pointer = useElement<HTMLDivElement>()
  const host = useElement<HTMLDivElement>()
  return (
    <TokenCard
      name="nudge"
      sample={
        <div
          ref={host}
          className="relative flex size-12 items-center justify-center rounded-full"
        >
          <div ref={pointer} className="size-4 rounded-full bg-ink" />
        </div>
      }
      play={(reduced) => {
        const dot = pointer.current
        const ring = host.current
        if (!dot || !ring) {
          return
        }
        if (reduced) {
          stillRing(ring)
          return
        }
        const cycle = motionTokens.nudge.duration / 1000
        const tapEnd = motionDetails.nudgeTapTimes.at(-1) ?? 1
        // The tap, then one ring, once
        animate(
          dot,
          { scale: [...motionDetails.nudgeTap] },
          {
            duration: cycle * tapEnd,
            times: motionDetails.nudgeTapTimes.map((time) => time / tapEnd),
            ease: [...motionTokens.nudge.curve],
          }
        )
        const element = document.createElement("span")
        element.className =
          "pointer-events-none absolute inset-0 rounded-full border-2 border-ink"
        ring.append(element)
        const { from, to } = motionDetails.nudgeRingScale
        const { shown, gone } = motionDetails.nudgeRingTimes
        void animate(
          element,
          {
            scale: [from, to],
            opacity: [0, motionDetails.nudgeRingOpacity, 0],
          },
          {
            duration: cycle * gone,
            ease: [...motionTokens.nudge.curve],
            opacity: {
              duration: cycle * gone,
              ease: [...motionTokens.nudge.curve],
              times: [0, shown / gone, 1],
            },
          }
        ).then(() => element.remove())
      }}
    />
  )
}

/** A row, with the behaviours of what is touched */
function Row({ name, value }: { name: string; value: string }) {
  const touch = useTouchMotion()
  return (
    <motion.button
      type="button"
      {...touch.props}
      className="relative flex w-full items-center justify-between rounded-control px-3 py-2.5 text-control transition-colors hover:bg-surface-2"
    >
      <span>{name}</span>
      <b>{value}</b>
      {touch.layers}
    </motion.button>
  )
}

function Behaviours() {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-control font-semibold">Behaviours</h3>
      <p className="max-w-190 text-small text-ink-2">
        Hover lifts (Lift); pressing with the pointer, Enter or Space squashes
        and sends out one ring from the point pressed, its centre with the
        keyboard (Squash held, Ring); releasing springs back (Press). Rows press
        the same way. Under reduced motion nothing moves and a press shows one
        still ring. Applied with useTouchMotion: the buttons, tabs and chips of
        the Components section have it built in (through Base UI&apos;s render
        prop), and the top bar&apos;s links are TouchLink (the router&apos;s
        Link made with createLink). The rows below try it on the ranking&apos;s
        rows.
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        <div className="flex flex-col gap-1 rounded-control border border-line bg-surface p-4">
          <p className="text-label text-ink-2 uppercase">Rows</p>
          <Row name="Helsinki" value="30%" />
          <Row name="Stockholm" value="28%" />
          <Row name="Berlin" value="27%" />
        </div>
      </div>
    </div>
  )
}

const systemQuery = "(prefers-reduced-motion: reduce)"

function subscribeToSystem(onChange: () => void) {
  const media = window.matchMedia(systemQuery)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

export function ReducedMotionSwitch() {
  const reduced = usePrefersReducedMotion()
  const system = useSyncExternalStore(
    subscribeToSystem,
    () => window.matchMedia(systemQuery).matches,
    () => false
  )

  // Leaving the kit page follows the system again
  useEffect(() => () => simulateReducedMotion(undefined), [])

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        aria-pressed={reduced}
        onClick={() => simulateReducedMotion(!reduced)}
      >
        Reduced motion: {reduced ? "on" : "off"}
      </Button>
      <span className="text-small text-ink-2">
        System setting: {system ? "reduce" : "no preference"}. The switch
        applies to the whole page (Motion, the behaviours and the tween helper).
      </span>
    </div>
  )
}

export function MotionKit() {
  return (
    <section className="flex flex-col gap-4.5 rounded-panel border border-line bg-surface px-8 py-7">
      <h2 className="font-serif text-title">Motion</h2>
      <p className="max-w-190 text-small text-ink-2">
        The motion tokens of src/design/tokens.ts. Springs (Lift, Press, Pop,
        Float) become Motion springs, with a visual duration and a bounce
        derived from their duration and overshoot; the other tokens become cubic
        Bézier curves. Each curve shows the token&apos;s progress over its
        duration (the dashed line is the target). Lift, Squash held, Squash,
        Ring, Press and Float play with Motion, as in the panel; Glide, Follow,
        Sink, Pop, Draw and Fade play with the tween helper, as on the map.
      </p>
      <ReducedMotionSwitch />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        <LiftCard />
        <SquashHeldCard />
        <SquashCard />
        <RingCard />
        <PressCard />
        <GlideCard />
        <FollowCard />
        <SinkCard />
        <PopCard />
        <DrawCard />
        <FadeCard />
        <FloatCard />
        <NudgeCard />
      </div>
      <Behaviours />
    </section>
  )
}
