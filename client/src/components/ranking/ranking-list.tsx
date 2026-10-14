import { useMemo, useRef } from "react"
import { useFormatter, useLocale, useTranslations } from "use-intl"

import { TouchLink } from "@/components/motion/touch-link"
import { CapitalOutline } from "@/components/ui/capital-outline"
import { ResultsBar } from "@/components/ui/results-bar"
import {
  RowHighlight,
  useRowHighlight,
  type RowHighlightProps,
} from "@/components/ui/row-highlight"
import type { Capital, RankingRow as RankingRowData } from "@/data/schemas"
import { motionDetails } from "@/design/tokens"
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
 * The capital under the pointer, or in keyboard focus, is highlighted, with
 * the box that follows from row to row (see `RowHighlight`).
 */

/** Attributes passed on to some rows, by capital */
export type RowProps = Partial<
  Record<CapitalSlug, { "data-force-focus"?: true }>
>

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
  current,
  muted,
  ...props
}: {
  row: RankingRowData
  outline: Capital["outline"] | undefined
  highlighted: boolean
  current: boolean
  muted: boolean
} & RowHighlightProps & { "data-force-focus"?: true }) {
  const t = useTranslations("ranking")
  const format = useFormatter()
  const locale = useLocale()
  const name = nameIn(row.name, locale)
  const [none, one, two, three] = row.shares.met.map(
    (share) => wholePercent(share) / 100
  )
  // Positioned, as links are, so the row is drawn over the highlight behind
  // it rather than under it
  const className =
    "relative flex w-full items-center gap-2 rounded-row border border-transparent px-2 py-1.75 text-control font-normal text-ink desktop:gap-2.5"

  const cells = (
    <>
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
      <span
        aria-hidden="true"
        className={cn({
          "min-w-0 flex-1 wrap-break-word": true,
          "font-semibold": current,
        })}
      >
        {name}
      </span>
      <ResultsBar
        shares={row.shares}
        muted={muted}
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
    </>
  )

  // The capital of the page is not a link: it is already open
  if (current) {
    return (
      <li className="flex">
        <div
          data-slug={row.slug}
          aria-current="page"
          className={className}
          onPointerEnter={props.onPointerEnter}
        >
          {cells}
        </div>
      </li>
    )
  }

  return (
    <li className="flex">
      <TouchLink
        to="/$locale/capitals/$slug"
        params={{ locale, slug: row.slug }}
        lift={false}
        squashScale={motionDetails.squashRowScale}
        data-slug={row.slug}
        className={className}
        {...props}
      >
        {cells}
      </TouchLink>
    </li>
  )
}

/**
 * The rows, in the order given. `highlighted` is a capital highlighted from
 * elsewhere (the map), as when it is hovered; the pointer and the keyboard
 * take over while they are on a row.
 *
 * With `current`, the rows are Other capitals on that capital's page: its
 * row is highlighted at rest, its name in semibold, and is not a link; the
 * other rows' bars are muted, so only its bar keeps its full colours.
 */
export function RankingList({
  rows,
  capitals,
  highlighted,
  current,
  rowProps,
}: {
  rows: Array<RankingRowData>
  capitals: Array<Capital>
  highlighted?: CapitalSlug
  current?: CapitalSlug
  rowProps?: RowProps
}) {
  const container = useRef<HTMLDivElement>(null)
  const outlines = useMemo(
    () => new Map(capitals.map(({ slug, outline }) => [slug, outline])),
    [capitals]
  )

  const {
    hot,
    squash,
    listProps,
    rowProps: highlightProps,
  } = useRowHighlight(highlighted ?? current)

  return (
    <div ref={container} className="relative -mx-2" {...listProps}>
      <RowHighlight container={container} at={hot} squash={squash} />
      {/* Lists without bullets keep their list semantics in Safari */}
      {/* oxlint-disable-next-line jsx-a11y/no-redundant-roles */}
      <ol role="list" className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <RankingRow
            key={row.slug}
            row={row}
            outline={outlines.get(row.slug)}
            highlighted={row.slug === hot}
            current={row.slug === current}
            muted={current !== undefined && row.slug !== current}
            {...highlightProps(row.slug)}
            {...rowProps?.[row.slug]}
          />
        ))}
      </ol>
    </div>
  )
}
