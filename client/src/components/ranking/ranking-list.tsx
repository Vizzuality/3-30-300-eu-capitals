import { animate, motion, useMotionValue } from "motion/react"
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type RefObject,
} from "react"
import { useFormatter, useLocale, useTranslations } from "use-intl"

import { TouchLink } from "@/components/motion/touch-link"
import { CapitalOutline } from "@/components/ui/capital-outline"
import { ResultsBar } from "@/components/ui/results-bar"
import type { Capital, RankingRow as RankingRowData } from "@/data/schemas"
import { motionDetails } from "@/design/tokens"
import { toReducedFade, transitions } from "@/design/tokens-motion"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { nameIn } from "@/i18n/names"
import type { CapitalSlug } from "@/lib/capitals"
import { isPodium, wholePercent } from "@/lib/ranking"
import { cn } from "@/lib/utils"

/*
 * The rows of the ranking, one per capital: its rank in a round badge (the
 * top three filled, like a small podium), its outline, its name, its bar and
 * the share of its residents meeting all three rules. Each row is a link to
 * the capital's page, reached with Tab like any link.
 *
 * The capital under the pointer, or in keyboard focus, is highlighted: its
 * row sits on a Surface 2 box edged by a hairline, and its outline is edged
 * in Ink. The box is one element behind the rows, which follows from row to
 * row (Follow). Rows do not rise on hover; pressed, they squash and send out
 * a ring like every control. Under reduced motion the box does not move: it
 * fades in on the row it lands on.
 */

/** Attributes passed on to some rows, by capital */
export type RowProps = Partial<
  Record<CapitalSlug, { "data-force-focus"?: true }>
>

/** Who highlights a row: the pointer, or the keyboard */
type Source = "pointer" | "focus"

function findRow(container: HTMLElement | null, slug: string) {
  return container?.querySelector<HTMLElement>(`[data-slug="${slug}"]`)
}

/**
 * The highlight box, placed on the row of `at`, or fading out where it was
 * when no row is highlighted. Its place comes from the row's position in the
 * list, so the panel's scrolling never moves it off its row.
 */
function RankingHighlight({
  container,
  at,
}: {
  container: RefObject<HTMLElement | null>
  at: CapitalSlug | undefined
}) {
  const reduced = usePrefersReducedMotion()
  const y = useMotionValue(0)
  const height = useMotionValue(0)
  const opacity = useMotionValue(0)
  // The row the box was last placed on, and whether it has been placed yet
  const placed = useRef<CapitalSlug | undefined>(undefined)
  const isFirst = useRef(true)

  useLayoutEffect(() => {
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

  // Rows change height when the window or the text does: the box follows
  useEffect(() => {
    const element = container.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver(() => {
      const row = placed.current ? findRow(element, placed.current) : null
      if (row) {
        y.jump(row.offsetTop)
        height.jump(row.offsetHeight)
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [container, y, height])

  return (
    <motion.span
      aria-hidden="true"
      data-slot="ranking-highlight"
      className="pointer-events-none absolute inset-x-0 top-0"
      style={{ y, height, opacity }}
    >
      <span className="absolute inset-0 rounded-row border border-line bg-surface-2" />
    </motion.span>
  )
}

function RankBadge({ rank }: { rank: number }) {
  const format = useFormatter()
  const podium = isPodium(rank)

  return (
    <span
      aria-hidden="true"
      className={cn({
        "grid size-6 flex-none place-items-center rounded-full border text-rank": true,
        "border-line text-ink-2": !podium,
        "border-ink bg-ink text-surface": podium,
      })}
    >
      {format.number(rank)}
    </span>
  )
}

function RankingRow({
  row,
  outline,
  highlighted,
  onHighlight,
  onLeave,
  ...props
}: {
  row: RankingRowData
  outline: Capital["outline"] | undefined
  highlighted: boolean
  onHighlight: (slug: CapitalSlug, source: Source) => void
  onLeave: (slug: CapitalSlug) => void
  "data-force-focus"?: true
}) {
  const t = useTranslations("ranking")
  const format = useFormatter()
  const locale = useLocale()
  const name = nameIn(row.name, locale)
  const [none, one, two, three] = row.shares.met.map(
    (share) => wholePercent(share) / 100
  )

  return (
    <li className="flex">
      <TouchLink
        to="/$locale/capitals/$slug"
        params={{ locale, slug: row.slug }}
        lift={false}
        data-slug={row.slug}
        onPointerEnter={(event: PointerEvent<HTMLAnchorElement>) => {
          // Fingers do not hover: a tap opens the capital
          if (event.pointerType !== "touch") {
            onHighlight(row.slug, "pointer")
          }
        }}
        onFocus={(event: FocusEvent<HTMLAnchorElement>) => {
          // The keyboard's focus, not a click's
          if (event.currentTarget.matches(":focus-visible")) {
            onHighlight(row.slug, "focus")
          }
        }}
        onBlur={() => onLeave(row.slug)}
        className="flex w-full items-center gap-2 rounded-row border border-transparent px-2 py-1.75 text-control font-normal text-ink desktop:gap-2.5"
        {...props}
      >
        <RankBadge rank={row.rank} />
        {outline ? (
          <CapitalOutline
            outline={outline}
            highlighted={highlighted}
            className="size-6 flex-none"
          />
        ) : (
          <span className="size-6 flex-none" />
        )}
        <span aria-hidden="true" className="min-w-0 flex-1 wrap-break-word">
          {name}
        </span>
        <ResultsBar
          shares={row.shares}
          className="w-24 flex-none desktop:w-33"
        />
        <span
          aria-hidden="true"
          className="w-9 flex-none text-right font-semibold desktop:w-10"
        >
          {format.number(three, { style: "percent" })}
        </span>
        {/* What the row shows, in one sentence, for screen readers */}
        <span className="sr-only">
          {t("row", { capital: name, rank: row.rank, three, two, one, none })}
        </span>
      </TouchLink>
    </li>
  )
}

/**
 * The rows, in the order given. `highlighted` is a capital highlighted from
 * elsewhere (the map), as when it is hovered; the pointer and the keyboard
 * take over while they are on a row.
 */
export function RankingList({
  rows,
  capitals,
  highlighted,
  rowProps,
}: {
  rows: Array<RankingRowData>
  capitals: Array<Capital>
  highlighted?: CapitalSlug
  rowProps?: RowProps
}) {
  const container = useRef<HTMLDivElement>(null)
  const outlines = useMemo(
    () => new Map(capitals.map(({ slug, outline }) => [slug, outline])),
    [capitals]
  )

  // The row under the pointer and the row in keyboard focus; the latest of
  // the two is highlighted
  const [hovered, setHovered] = useState<CapitalSlug>()
  const [focused, setFocused] = useState<CapitalSlug>()
  const [latest, setLatest] = useState<Source>("pointer")
  const active =
    latest === "focus" ? (focused ?? hovered) : (hovered ?? focused)
  const hot = active ?? highlighted

  return (
    <div
      ref={container}
      className="relative -mx-2"
      onPointerLeave={() => setHovered(undefined)}
    >
      <RankingHighlight container={container} at={hot} />
      {/* Lists without bullets keep their list semantics in Safari */}
      {/* oxlint-disable-next-line jsx-a11y/no-redundant-roles */}
      <ol role="list" className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <RankingRow
            key={row.slug}
            row={row}
            outline={outlines.get(row.slug)}
            highlighted={row.slug === hot}
            onHighlight={(slug, source) => {
              setLatest(source)
              if (source === "pointer") {
                setHovered(slug)
              } else {
                setFocused(slug)
              }
            }}
            onLeave={(slug) =>
              setFocused((current) => (current === slug ? undefined : current))
            }
            {...rowProps?.[row.slug]}
          />
        ))}
      </ol>
    </div>
  )
}
