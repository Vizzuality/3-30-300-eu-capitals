/*
 * Builds the stand-in release: the capitals of a real release kept as they
 * are (Stockholm), and every other capital with placeholder figures and
 * outline taken from the reference design, marked `placeholder: true`.
 */
import {
  WebMercatorViewport,
  fitBounds,
  getBounds,
} from "@math.gl/web-mercator"

import { locales } from "@/i18n/locales"
import { capitalSlugs, type CapitalSlug } from "@/lib/capitals"
import {
  capitalsSchema,
  naturalEarthSourceSchema,
  outlineSchema,
  rankingSchema,
  sourcesSchema,
  summarySchema,
  type Capital,
  type Capitals,
  type CityOutline,
  type Names,
  type Ranking,
  type RankingRow,
  type Shares,
  type Sources,
  type Summary,
} from "@/data/schemas"
import naturalEarthFile from "@scripts/stand-in/natural-earth.json" with { type: "json" }
import { capitalFacts } from "./capitals"

/*
 * Natural Earth, the source of the Home map's countries, as the first release
 * with the Home map (2026-10-all) lists it. The stand-in always has the Home
 * map, so it credits Natural Earth even when built from a release without it.
 */
const naturalEarth = naturalEarthSourceSchema.parse(naturalEarthFile)

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
  /** The city limits drawn on each capital's page */
  outlines: CityOutline[]
}

const round = (value: number, decimals: number) =>
  Number(value.toFixed(decimals))

/** The capitals of the real release that the stand-in keeps as they are */
export const standInRealCapitals: ReadonlyArray<CapitalSlug> = ["stockholm"]

/**
 * A real release cut down to some of its capitals, as if the pipeline had
 * computed only those: their ranking rows (ranked again), outlines,
 * summaries and sources. The release's own list of sources is kept as it is.
 */
export function onlyCapitals(
  release: Release,
  slugs: ReadonlyArray<CapitalSlug>
): Release {
  const kept = <T extends { slug: CapitalSlug }>(rows: T[]) =>
    rows.filter(({ slug }) => slugs.includes(slug))
  const complete = slugs.length === capitalSlugs.length

  return {
    ranking: {
      ...release.ranking,
      complete,
      capitals: kept(release.ranking.capitals).map((row, index) => ({
        ...row,
        rank: index + 1,
      })),
    },
    capitals: {
      ...release.capitals,
      complete,
      capitals: kept(release.capitals.capitals),
    },
    sources: {
      ...release.sources,
      capitals: Object.fromEntries(
        Object.entries(release.sources.capitals).filter(([slug]) =>
          slugs.includes(slug as CapitalSlug)
        )
      ),
    },
    summaries: kept(release.summaries),
    outlines: kept(release.outlines),
  }
}

/**
 * How much a capital's outline is enlarged on the Home map, as the pipeline
 * lays it out: at the Home view's reference scale (6,000 Web Mercator metres
 * per pixel), its size (the square root of its area) is 12.5 × km^0.4
 * pixels, so the smaller the city, the more it is enlarged. Rounded to 4
 * significant digits, as the pipeline writes it.
 */
export function homeScale(km: number, latitude: number) {
  const sizePixels = 12.5 * km ** 0.4
  const groundMetresPerPixel = 6000 * Math.cos((latitude * Math.PI) / 180)
  return Number(
    ((sizePixels * groundMetresPerPixel) / (km * 1000)).toPrecision(4)
  )
}

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
/** Metres east and north of a place, as degrees of longitude and latitude */
function degreesPerMetre(latitude: number) {
  return {
    lon: 1 / (111_320 * Math.cos((latitude * Math.PI) / 180)),
    lat: 1 / 110_574,
  }
}

function outlineBounds(
  outline: Capital["outline"],
  [lon, lat]: [number, number]
) {
  const points = outline.flat(2)
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const per = degreesPerMetre(lat)

  return [
    round(lon + Math.min(...xs) * per.lon, 5),
    round(lat + Math.min(...ys) * per.lat, 5),
    round(lon + Math.max(...xs) * per.lon, 5),
    round(lat + Math.max(...ys) * per.lat, 5),
  ] as Summary["bbox"]
}

/**
 * The maps the release fits a city to, as the site lays them out: the
 * desktop map and the phone's map band, with the room kept clear of what
 * floats over them (top, right, bottom, left)
 */
const contextMaps = {
  desktop: {
    width: 960,
    height: 900,
    padding: { top: 72, right: 72, bottom: 42, left: 28 },
  },
  phone: {
    width: 412,
    height: 386,
    padding: { top: 72, right: 16, bottom: 80, left: 16 },
  },
} as const

const roundUp = (value: number, decimals: number) =>
  Math.ceil(value * 10 ** decimals) / 10 ** decimals
const roundDown = (value: number, decimals: number) =>
  Math.floor(value * 10 ** decimals) / 10 ** decimals

/**
 * The overview's rectangle around a city's bounds, as the release computes
 * it: each layout's least zoom is one below the zoom that fits the city,
 * and the rectangle holds what both layouts show at their least zoom,
 * around the fitted centres; the context tiles go from the floor of the
 * lower least zoom (at most 9) to 12, or to the fitted zoom when closer
 */
export function contextOf([west, south, east, north]: Summary["bbox"]) {
  const views = Object.values(contextMaps).map(({ width, height, padding }) => {
    const fitted = fitBounds({
      width,
      height,
      bounds: [
        [west, south],
        [east, north],
      ],
      padding,
      maxZoom: 18,
    })
    const corners = getBounds(
      new WebMercatorViewport({
        ...fitted,
        zoom: fitted.zoom - 1,
        width,
        height,
      })
    )
    return { zoom: roundUp(fitted.zoom - 1, 2), fitted: fitted.zoom, corners }
  })
  const longitudes = views.flatMap(({ corners }) => corners.map(([x]) => x))
  const latitudes = views.flatMap(({ corners }) => corners.map(([, y]) => y))
  const [desktop, phone] = views.map(({ zoom }) => zoom)
  return {
    context: {
      bbox: [
        roundDown(Math.min(...longitudes), 5),
        roundDown(Math.min(...latitudes), 5),
        roundUp(Math.max(...longitudes), 5),
        roundUp(Math.max(...latitudes), 5),
      ] as Summary["bbox"],
      min_zoom: { desktop, phone },
    },
    zooms: [
      Math.min(9, Math.floor(Math.min(desktop, phone))),
      // deck.gl loads the tiles of the rounded zoom
      Math.max(12, ...views.map((view) => Math.round(view.fitted))),
    ] as [number, number],
  }
}

/** Twice the signed area of a ring: positive when counter-clockwise */
function signedArea(ring: Array<[number, number]>) {
  let sum = 0
  for (let index = 1; index < ring.length; index++) {
    const [x0, y0] = ring[index - 1]
    const [x1, y1] = ring[index]
    sum += x0 * y1 - x1 * y0
  }
  return sum
}

/**
 * A placeholder's city limits: its placeholder outline in degrees, as the
 * release writes them (exteriors counter-clockwise, holes clockwise)
 */
export function placeholderCityOutline(
  slug: CapitalSlug,
  outline: Capital["outline"],
  [lon, lat]: [number, number],
  release: string
): CityOutline {
  const per = degreesPerMetre(lat)
  const coordinates = outline.map((rings) =>
    rings.map((ring, index) => {
      const turned = [...ring]
      if (signedArea(ring) > 0 !== (index === 0)) {
        turned.reverse()
      }
      return turned.map(
        ([x, y]) =>
          [round(lon + x * per.lon, 6), round(lat + y * per.lat, 6)] as [
            number,
            number,
          ]
      )
    })
  )
  return outlineSchema.parse({
    type: "Feature",
    schema_version: 1,
    release,
    slug,
    // As simplified as the placeholder outline, about 50 m
    tolerance_m: 50,
    properties: { slug },
    geometry: { type: "MultiPolygon", coordinates },
    placeholder: true,
  })
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
 * and every other one of the 27 from `reference`, marked as a placeholder.
 * A placeholder's figures are made up, but its sources are those of the
 * same capital in the real release (`realSources`, from its `sources.json`)
 * when it has them, so the dates the site quotes for it (the imagery's
 * months, on the Methodology page) are real; otherwise those of a real
 * capital, so its files keep their shape.
 */
export function buildStandIn(
  real: Release,
  reference: ReferenceRow[],
  release: string,
  realSources: Sources["capitals"] = {}
) {
  const template = real.summaries[0]
  if (!template) {
    throw new Error("The real release has no capital")
  }

  const realSlugs = new Set(real.ranking.capitals.map(({ slug }) => slug))
  const rows: Array<Omit<RankingRow, "rank">> = []
  const capitals: Capital[] = []
  const summaries: Summary[] = []
  const outlines: CityOutline[] = real.outlines.map((outline) => ({
    ...outline,
    release,
  }))

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
      // Placeholders are never nudged apart, so they need no leader line
      display: facts.centre,
      km,
      scale: homeScale(km, facts.centre[1]),
      leader: null,
      outline,
      placeholder: true,
    })
    outlines.push(placeholderCityOutline(slug, outline, facts.centre, release))
    const bbox = outlineBounds(outline, facts.centre)
    const { context, zooms } = contextOf(bbox)
    summaries.push({
      schema_version: 1,
      release,
      ...common,
      shares,
      suggested: facts.centre,
      bbox,
      // Its rectangle, as the release would have it, though it has no tiles
      context,
      area_km2: facts.area,
      // No names are drawn on a placeholder's map
      label_chars: "",
      zooms: { ...template.zooms, context: zooms },
      sources: realSources[slug] ?? template.sources,
      placeholder: true,
    })
  }

  // Highest share meeting all three rules first; ties by slug
  rows.sort(
    (a, b) => b.shares.met[3] - a.shares.met[3] || a.slug.localeCompare(b.slug)
  )
  capitals.sort((a, b) => a.slug.localeCompare(b.slug))
  summaries.sort((a, b) => a.slug.localeCompare(b.slug))
  outlines.sort((a, b) => a.slug.localeCompare(b.slug))

  const complete = rows.length === capitalSlugs.length
  // The capitals in the order the pipeline lists them
  const bySlug = [...capitalSlugs]
  bySlug.sort()

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
    sources: sourcesSchema.parse({
      ...real.sources,
      release,
      sources: withNaturalEarth(real.sources.sources),
      // Every capital whose sources are known, as a complete release lists
      // them
      capitals: Object.fromEntries(
        bySlug.flatMap((slug) => {
          const known = real.sources.capitals[slug] ?? realSources[slug]
          return known ? [[slug, known]] : []
        })
      ),
    }),
    summaries: summaries.map((summary) => summarySchema.parse(summary)),
    outlines: outlines.map((outline) => outlineSchema.parse(outline)),
  }
}

/** The sources of a release, with Natural Earth when it does not list it */
function withNaturalEarth(sources: Sources["sources"]): Sources["sources"] {
  const [osm, land, buildings, canopy, population, names, countries] = sources
  return [
    osm,
    land,
    buildings,
    canopy,
    population,
    names,
    countries ?? naturalEarth,
  ]
}
