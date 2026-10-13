/*
 * Builds the stand-in release: the capitals of a real release as they are,
 * and every other capital with placeholder figures and outline taken from the
 * reference design, marked `placeholder: true`.
 */
import { locales } from "@/i18n/locales"
import { capitalSlugs, type CapitalSlug } from "@/lib/capitals"
import {
  capitalsSchema,
  rankingSchema,
  sourcesSchema,
  summarySchema,
  type Capital,
  type Capitals,
  type Names,
  type Ranking,
  type RankingRow,
  type Shares,
  type Sources,
  type Summary,
} from "@/data/schemas"
import { capitalFacts } from "./capitals"

/**
 * A capital of the reference design: rank, English name, English country
 * name, the percentages of residents meeting 3, 2, 1 and 0 rules, the
 * percentage meeting all three, and the outline as an SVG path with its
 * view box.
 */
export type ReferenceRow = [
  rank: number,
  name: string,
  country: string,
  met: [number, number, number, number],
  all3: number,
  path: string,
  viewBox: string,
]

export type Release = {
  ranking: Ranking
  capitals: Capitals
  sources: Sources
  summaries: Summary[]
}

const round = (value: number, decimals: number) =>
  Number(value.toFixed(decimals))

/** The same name in every language, until the pipeline gives translations */
function sameInEveryLanguage(name: string): Names {
  return Object.fromEntries(locales.map((locale) => [locale, name])) as Names
}

/**
 * Placeholder shares from the reference's percentages meeting 3, 2, 1 and 0
 * rules (which may not add up to 100). Each rule gets the same share: the
 * average number of rules met, divided by three, which always lies between
 * the share meeting all three and the share meeting at least one.
 */
export function placeholderShares(percentages: ReferenceRow[3]): Shares {
  const total = percentages.reduce((sum, value) => sum + value)
  const [d3, d2, d1, d0] = percentages.map((value) => value / total)
  const rule = round((d1 + 2 * d2 + 3 * d3) / 3, 4)

  return {
    met: [round(d0, 4), round(d1, 4), round(d2, 4), round(d3, 4)],
    rules: { "3": rule, "30": rule, "300": rule },
  }
}

/**
 * The polygons of an SVG path made of absolute moves, relative lines and
 * closes (`M x y l dx dy … z`), each as one ring in the path's coordinates
 */
export function parsePath(path: string) {
  const tokens = path.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? []
  const rings: Array<Array<[number, number]>> = []
  let command = ""
  let index = 0
  let ring: Array<[number, number]> = []

  const next = () => Number(tokens[index++])

  while (index < tokens.length) {
    if (/[A-Za-z]/.test(tokens[index])) {
      command = tokens[index++]
      if (command === "z") {
        rings.push(ring)
        ring = []
      }
      continue
    }
    if (command === "M") {
      ring = [[next(), next()]]
      // Coordinates after a move are lines
      command = "L"
    } else if (command === "l") {
      const [x, y] = ring.at(-1) ?? [0, 0]
      ring.push([x + next(), y + next()])
    } else {
      throw new Error(`Unsupported path command "${command}"`)
    }
  }
  if (ring.length > 0) {
    rings.push(ring)
  }
  return rings
}

/** Signed area and centroid of a ring (shoelace formula) */
function ringGeometry(ring: Array<[number, number]>) {
  let area = 0
  let cx = 0
  let cy = 0
  ring.forEach(([x0, y0], i) => {
    const [x1, y1] = ring[(i + 1) % ring.length]
    const cross = x0 * y1 - x1 * y0
    area += cross
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
  })
  area /= 2
  return { area, cx: cx / (6 * area), cy: cy / (6 * area) }
}

/**
 * A reference outline as a release outline: in metres from its centroid,
 * x east and y north, scaled so that its area is `km` squared, with one
 * closed ring per polygon
 */
export function placeholderOutline(path: string, km: number) {
  const rings = parsePath(path)
  const parts = rings.map(ringGeometry)
  const area = parts.reduce((sum, part) => sum + Math.abs(part.area), 0)
  const signed = parts.reduce((sum, part) => sum + part.area, 0)
  const cx = parts.reduce((sum, part) => sum + part.cx * part.area, 0) / signed
  const cy = parts.reduce((sum, part) => sum + part.cy * part.area, 0) / signed
  const scale = (km * 1000) / Math.sqrt(area)

  return rings.map((ring) => {
    // SVG's y axis points down
    const points = ring.map(([x, y]): [number, number] => [
      round((x - cx) * scale, 1),
      round((cy - y) * scale, 1),
    ])
    return [[...points, points[0]]]
  })
}

/** West, south, east, north of an outline around `centre`, in degrees */
function outlineBounds(
  outline: Capital["outline"],
  [lon, lat]: [number, number]
) {
  const points = outline.flat(2)
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const metresPerDegreeLon = 111_320 * Math.cos((lat * Math.PI) / 180)
  const metresPerDegreeLat = 110_574

  return [
    round(lon + Math.min(...xs) / metresPerDegreeLon, 5),
    round(lat + Math.min(...ys) / metresPerDegreeLat, 5),
    round(lon + Math.max(...xs) / metresPerDegreeLon, 5),
    round(lat + Math.max(...ys) / metresPerDegreeLat, 5),
  ] as Summary["bbox"]
}

function slugOf(name: string) {
  const slug = name.toLowerCase()
  if (!(capitalSlugs as ReadonlyArray<string>).includes(slug)) {
    throw new Error(`"${name}" is not one of the 27 capitals`)
  }
  return slug as CapitalSlug
}

/**
 * The stand-in release, named `release`: every capital of `real` as it is,
 * and every other one of the 27 from `reference`, marked as a placeholder
 */
export function buildStandIn(
  real: Release,
  reference: ReferenceRow[],
  release: string
) {
  const template = real.summaries[0]
  if (!template) {
    throw new Error("The real release has no capital")
  }

  const realSlugs = new Set(real.ranking.capitals.map(({ slug }) => slug))
  const rows: Array<Omit<RankingRow, "rank">> = []
  const capitals: Capital[] = []
  const summaries: Summary[] = []

  for (const row of real.ranking.capitals) {
    const { rank: _rank, ...rest } = row
    rows.push(rest)
  }
  for (const capital of real.capitals.capitals) {
    capitals.push(capital)
  }
  for (const summary of real.summaries) {
    summaries.push({ ...summary, release })
  }

  for (const [, englishName, countryName, percentages, , path] of reference) {
    const slug = slugOf(englishName)
    if (realSlugs.has(slug)) {
      continue
    }

    const facts = capitalFacts[slug]
    const name = sameInEveryLanguage(englishName)
    const country = {
      code: facts.country,
      name: sameInEveryLanguage(countryName),
    }
    const shares = placeholderShares(percentages)
    const km = round(Math.sqrt(facts.area), 2)
    const outline = placeholderOutline(path, km)
    const common = {
      slug,
      name,
      local_name: facts.localName,
      language: facts.language,
      country,
      residents: facts.residents,
      centre: facts.centre,
    }

    rows.push({
      slug,
      name,
      country,
      residents: facts.residents,
      shares,
      placeholder: true,
    })
    capitals.push({
      ...common,
      display: facts.centre,
      km,
      outline,
      placeholder: true,
    })
    summaries.push({
      schema_version: 1,
      release,
      ...common,
      shares,
      suggested: facts.centre,
      bbox: outlineBounds(outline, facts.centre),
      area_km2: facts.area,
      // No names are drawn on a placeholder's map
      label_chars: "",
      zooms: template.zooms,
      // The sources of a real capital, so the file keeps its shape
      sources: template.sources,
      placeholder: true,
    })
  }

  // Highest share meeting all three rules first; ties by slug
  rows.sort(
    (a, b) => b.shares.met[3] - a.shares.met[3] || a.slug.localeCompare(b.slug)
  )
  capitals.sort((a, b) => a.slug.localeCompare(b.slug))
  summaries.sort((a, b) => a.slug.localeCompare(b.slug))

  const complete = rows.length === capitalSlugs.length

  return {
    ranking: rankingSchema.parse({
      schema_version: 1,
      release,
      complete,
      capitals: rows.map((row, index) => ({ rank: index + 1, ...row })),
    }),
    capitals: capitalsSchema.parse({
      schema_version: 1,
      release,
      complete,
      capitals,
    }),
    sources: sourcesSchema.parse({ ...real.sources, release }),
    summaries: summaries.map((summary) => summarySchema.parse(summary)),
  }
}
