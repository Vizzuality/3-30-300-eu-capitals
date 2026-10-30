import { useId } from "react"
import { useFormatter, useTranslations } from "use-intl"

import { externalLinkTag } from "@/components/ui/external-link"
import { textLinkVariants } from "@/components/ui/text-link"
import type { Sources } from "@/data/schemas"
import { geofabrik } from "@/lib/site-links"
import {
  sourceDate,
  sourceOf,
  sourceRows,
  type SourceDate,
  type SourceRow,
} from "@/lib/source-table"
import { richTags } from "./blocks"

/*
 * The data table of the Methodology page: every kind of data the method
 * reads, with its source, version, resolution, date and licence. The
 * sources, their versions and dates come from the release, so they are
 * always those of the data on the map; what each is used for and its
 * resolution are the page's messages.
 */

const precisions = {
  year: { year: "numeric" },
  month: { year: "numeric", month: "long" },
  day: { year: "numeric", month: "long", day: "numeric" },
} as const

/**
 * Formats a source's date, or its interval, in the visitor's language. The
 * release's dates are in UTC, and so is what is shown of them. An interval
 * joins its two dates with a message, rather than with the browser's own
 * ranges, whose spaces differ from the server's (Node writes thin spaces
 * around the dash, Chrome plain ones), so the page would not hydrate.
 */
export function useSourceDateFormat() {
  const t = useTranslations("methodology.data")
  const format = useFormatter()

  return ({ start, end, precision }: SourceDate) => {
    const options = { ...precisions[precision], timeZone: "UTC" }
    if (end === undefined) {
      return format.dateTime(start, options)
    }
    // Months of one year name the year once ("February–May 2019")
    const sameYear =
      precision === "month" && start.getUTCFullYear() === end.getUTCFullYear()
    return t("interval", {
      start: format.dateTime(
        start,
        sameYear ? { month: "long", timeZone: "UTC" } : options
      ),
      end: format.dateTime(end, options),
    })
  }
}

/**
 * The dates the page's text quotes, as the table shows them: the canopy
 * height map's imagery, the population, the buildings and OpenStreetMap
 */
export function useQuotedDates(sources: Sources) {
  const formatDate = useSourceDateFormat()
  const rows = sourceRows(sources.sources)
  const dateOf = (row: SourceRow["row"]) => {
    const found = rows.find((item) => item.row === row)
    return found ? formatDate(found.date) : ""
  }

  return {
    imagery: dateOf("trees"),
    population: dateOf("population"),
    buildings: dateOf("buildings"),
    osm: dateOf("boundaries"),
  }
}

function VersionText({ row }: { row: SourceRow }) {
  const t = useTranslations("methodology.data")
  const { version } = row
  if (!version) {
    return null
  }

  return (
    <span className="block text-ink-2">
      {version.kind === "extracts"
        ? t("version", { kind: "extracts", count: version.count, name: "" })
        : t("version", { kind: "name", count: 0, name: version.name })}
    </span>
  )
}

const cell = "border-b border-line px-3 py-2.25 align-top"

export function DataTable({ sources }: { sources: Sources }) {
  const t = useTranslations("methodology.data")
  const formatDate = useSourceDateFormat()
  const captionId = useId()
  const rows = sourceRows(sources.sources)

  return (
    <section
      aria-labelledby={captionId}
      // Scrolls sideways on narrow screens, so it can be reached and
      // scrolled with the keyboard
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      className="overflow-x-auto rounded-control border border-line bg-surface"
    >
      <table className="w-full border-collapse text-small">
        <caption id={captionId} className="sr-only">
          {t("caption")}
        </caption>
        <thead>
          <tr>
            {(["data", "source", "resolution", "date", "licence"] as const).map(
              (column) => (
                <th
                  key={column}
                  scope="col"
                  className="border-b border-line px-3 py-2.5 text-left text-label text-ink-2 uppercase"
                >
                  {t(`columns.${column}`)}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>*]:border-b-0">
          {rows.map((row) => (
            <tr key={row.row}>
              <th scope="row" className={`${cell} text-left font-semibold`}>
                {t(`rows.${row.row}.data`)}
              </th>
              <td className={cell}>
                {row.name}
                <VersionText row={row} />
              </td>
              <td className={cell}>{t(`rows.${row.row}.resolution`)}</td>
              <td className={cell}>
                {t("date", {
                  imagery: row.imagery ? "yes" : "no",
                  date: formatDate(row.date),
                })}
              </td>
              <td className={cell}>{row.licence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

const inlineLink = textLinkVariants({ variant: "inline" })

/**
 * OpenStreetMap is read from dated extracts, so a release can be computed
 * again from the same data: the date of those of this release
 */
export function ExtractNote({ sources }: { sources: Sources }) {
  const t = useTranslations("methodology.data")
  const formatDate = useSourceDateFormat()
  const osm = sourceOf(sources.sources, "osm")

  return (
    <p className="text-body">
      {t.rich("extract", {
        ...richTags,
        link: externalLinkTag(geofabrik, inlineLink),
        date: formatDate(sourceDate(osm.date, "day")),
      })}
    </p>
  )
}
