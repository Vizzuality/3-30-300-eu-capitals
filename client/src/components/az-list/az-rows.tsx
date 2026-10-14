import { useRef } from "react"
import { useLocale, useTranslations } from "use-intl"

import { ChevronRightIcon } from "@/components/icons"
import { TouchLink } from "@/components/motion/touch-link"
import { CapitalOutline } from "@/components/ui/capital-outline"
import {
  RowHighlight,
  useRowHighlight,
  type RowHighlightProps,
} from "@/components/ui/row-highlight"
import type { Capital } from "@/data/schemas"
import { motionDetails } from "@/design/tokens"
import type { AzCapital } from "@/lib/az-list"
import type { CapitalSlug } from "@/lib/capitals"

/*
 * The rows of the A–Z list, one per capital: its outline, its name and,
 * under it, its country. No bars: this list is for finding a city. Each row
 * is a link to the capital's page, and responds like the ranking's rows: the
 * capital under the pointer, or in keyboard focus, is highlighted with the
 * box that follows from row to row (see `RowHighlight`), rows do not rise,
 * and pressed, they squash and send out a ring.
 */

/** Attributes passed on to some rows, by capital */
export type AzRowProps = Partial<
  Record<CapitalSlug, { "data-force-focus"?: true }>
>

function AzRow({
  entry: { capital, name, country },
  highlighted,
  ...props
}: {
  entry: AzCapital<Capital>
  highlighted: boolean
} & RowHighlightProps & { "data-force-focus"?: true }) {
  const t = useTranslations("home.az")
  const locale = useLocale()

  return (
    <li className="flex">
      <TouchLink
        to="/$locale/capitals/$slug"
        params={{ locale, slug: capital.slug }}
        lift={false}
        squashScale={motionDetails.squashRowScale}
        data-slug={capital.slug}
        className="flex w-full items-center gap-3 rounded-row border border-transparent p-2 text-ink"
        {...props}
      >
        <CapitalOutline
          outline={capital.outline}
          highlighted={highlighted}
          className="size-7.5 flex-none"
        />
        <span
          aria-hidden="true"
          className="flex min-w-0 flex-1 flex-col wrap-break-word"
        >
          <span className="text-list-name">{name}</span>
          <span className="text-small text-ink-2">{country}</span>
        </span>
        <ChevronRightIcon className="flex-none text-ink-2" />
        {/* The name and the country, read as one, for screen readers */}
        <span className="sr-only">{t("row", { capital: name, country })}</span>
      </TouchLink>
    </li>
  )
}

/**
 * The rows, in the order given. `highlighted` is a capital highlighted from
 * elsewhere (the map); the pointer and the keyboard take over while they are
 * on a row.
 */
export function AzRows({
  entries,
  highlighted,
  rowProps,
}: {
  entries: Array<AzCapital<Capital>>
  highlighted?: CapitalSlug
  rowProps?: AzRowProps
}) {
  const container = useRef<HTMLDivElement>(null)
  const {
    hot,
    squash,
    listProps,
    rowProps: highlightProps,
  } = useRowHighlight(highlighted)

  return (
    <div ref={container} className="relative -mx-2" {...listProps}>
      <RowHighlight container={container} at={hot} squash={squash} />
      {/* Lists without bullets keep their list semantics in Safari */}
      {/* oxlint-disable-next-line jsx-a11y/no-redundant-roles */}
      <ul role="list" className="flex flex-col gap-0.5">
        {entries.map((entry) => (
          <AzRow
            key={entry.capital.slug}
            entry={entry}
            highlighted={entry.capital.slug === hot}
            {...highlightProps(entry.capital.slug)}
            {...rowProps?.[entry.capital.slug]}
          />
        ))}
      </ul>
    </div>
  )
}
