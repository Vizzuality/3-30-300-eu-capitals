import type { Sources } from "@/data/schemas"
import type { Source } from "./credits"

/*
 * The data table of the Methodology page, from the release's sources: one
 * row for each kind of data the method reads, with the source it comes
 * from, so the versions and dates shown are always those of the data on the
 * map. Several rows share a source (OpenStreetMap gives the boundaries, the
 * water, the green spaces and the walking network). A source missing from
 * the release (Natural Earth, without the Home map) leaves its row out.
 */

/** The kinds of data, in the table's order, with the source of each */
export const dataRows = [
  { row: "boundaries", source: "osm" },
  { row: "coastline", source: "osm_land_polygons" },
  { row: "water", source: "osm" },
  { row: "trees", source: "canopy_height" },
  { row: "buildings", source: "overture_buildings" },
  { row: "greenSpaces", source: "osm" },
  { row: "walking", source: "osm" },
  { row: "population", source: "ghs_pop" },
  { row: "placeNames", source: "wikidata" },
  { row: "countries", source: "natural_earth" },
] as const satisfies ReadonlyArray<{ row: string; source: Source["id"] }>

export type DataRowId = (typeof dataRows)[number]["row"]

/**
 * A source's version as the table shows it: OpenStreetMap's, a list of the
 * Geofabrik extracts read ("Geofabrik europe/austria-261011, europe/…"), by
 * their number; any other as the release writes it
 */
export type SourceVersion =
  | { kind: "extracts"; count: number }
  | { kind: "name"; name: string }

/**
 * How finely a date is shown: in the table, the canopy height map's imagery
 * and the population's epoch by year, the rest by month; the OpenStreetMap
 * extract's date, in the text, by day
 */
export type DatePrecision = "year" | "month" | "day"

/** A source's date, or the interval between its first and last dates */
export type SourceDate = {
  start: Date
  // Only when it falls in another year or month than the start, as shown
  end?: Date
  precision: DatePrecision
}

export type SourceRow = {
  row: DataRowId
  name: string
  version: SourceVersion | undefined
  date: SourceDate
  // Whether the date is that of the imagery the data was made from
  imagery: boolean
  licence: string
}

const geofabrik = "Geofabrik "

export function sourceVersion(source: Source): SourceVersion | undefined {
  if (source.version === null) {
    return undefined
  }
  if (source.id === "osm" && source.version.startsWith(geofabrik)) {
    return {
      kind: "extracts",
      count: source.version.slice(geofabrik.length).split(", ").length,
    }
  }
  return { kind: "name", name: source.version }
}

/**
 * A date of the release (ISO 8601: a year, a date or a UTC timestamp), as a
 * moment in UTC
 */
export function parseDate(value: string) {
  return new Date(/^\d{4}$/.test(value) ? `${value}-01-01` : value)
}

function sameAt(precision: DatePrecision, a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    (precision === "year" || a.getUTCMonth() === b.getUTCMonth()) &&
    (precision !== "day" || a.getUTCDate() === b.getUTCDate())
  )
}

/** A source's date (or interval `first/last`), at the precision it is shown */
export function sourceDate(value: string, precision: DatePrecision) {
  const [first, last] = value.split("/")
  const start = parseDate(first)
  const end = last === undefined ? undefined : parseDate(last)
  const date: SourceDate = { start, precision }
  if (end && !sameAt(precision, start, end)) {
    date.end = end
  }
  return date
}

const byYear: ReadonlyArray<Source["id"]> = ["canopy_height", "ghs_pop"]

/** The rows of the data table, for the sources of a release */
export function sourceRows(sources: Sources["sources"]): Array<SourceRow> {
  return dataRows.flatMap(({ row, source: id }) => {
    const source = sources.find((item) => item?.id === id)
    if (!source) {
      return []
    }
    return [
      {
        row,
        name: source.name,
        version: sourceVersion(source),
        date: sourceDate(
          source.date,
          byYear.includes(source.id) ? "year" : "month"
        ),
        imagery: source.id === "canopy_height",
        licence: source.licence,
      },
    ]
  })
}

/** The source of the given id, which every release has */
export function sourceOf<Id extends Source["id"]>(
  sources: Sources["sources"],
  id: Id
) {
  const source = sources.find((item) => item?.id === id)
  if (!source) {
    throw new Error(`The release has no ${id} source`)
  }
  return source
}
