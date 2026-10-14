/*
 * The JSON files of a data release, as the pipeline writes them (schema
 * version 1). The data API validates every file it reads with these schemas,
 * and the browser validates every response, so both sides share one contract.
 */
import * as z from "zod"

import { locales } from "@/i18n/locales"
import { capitalSlugs } from "@/lib/capitals"

/** An incompatible change of the format increments it */
const schemaVersion = z.literal(1)

/**
 * The name of a release: the first segment of the data API's URLs and the
 * folder of the release in the bucket, e.g. `2026-10-stockholm`
 */
export const releaseNameSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/)

/**
 * The name of the stand-in release: the development and test data, with
 * placeholder capitals. It is never cached for good.
 */
export const standInRelease = "stand-in"

export const capitalSlugSchema = z.enum(capitalSlugs)

/** One string per locale, always all 24 */
const namesSchema = z.record(z.enum(locales), z.string().min(1))

/** A fraction of residents, from 0 to 1 */
const shareSchema = z.number().min(0).max(1)

/** `[lon, lat]` in WGS 84 degrees */
const lonLatSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
])

const countrySchema = z.object({
  // ISO 3166-1 alpha-2
  code: z.string().regex(/^[A-Z]{2}$/),
  name: namesSchema,
})

const sharesSchema = z.object({
  // Residents meeting 0, 1, 2 and 3 rules. Each share is rounded to 4
  // decimals, so the sum may be off by a few ten-thousandths.
  met: z
    .tuple([shareSchema, shareSchema, shareSchema, shareSchema])
    .refine(
      (met) => Math.abs(met.reduce((sum, share) => sum + share) - 1) < 1e-3,
      {
        message: "The shares of rules met must sum to 1",
      }
    ),
  // Residents meeting each rule
  rules: z.object({ "3": shareSchema, "30": shareSchema, "300": shareSchema }),
})

/**
 * Only in the client's stand-in release: the figures and outline of a capital
 * without real data yet. The pipeline never writes it.
 */
const placeholderSchema = z.literal(true).optional()

/**
 * An ISO 8601 date: a year, a date, a UTC timestamp, or an interval
 * `first/last` of those
 */
const isoDate = String.raw`\d{4}(?:-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?)?`
const dateSchema = z
  .string()
  .regex(new RegExp(String.raw`^${isoDate}(?:/${isoDate})?$`))

const versionedSource = z.object({
  version: z.string().min(1),
  date: dateSchema,
})
const unversionedSource = z.object({ version: z.null(), date: dateSchema })

/** The version and date of every source used for one capital */
const capitalSourcesSchema = z.object({
  osm: versionedSource.extend({
    // The boundary relation and its pinned version
    relation: z.int().positive(),
    relation_version: z.int().positive(),
  }),
  osm_land_polygons: unversionedSource,
  overture_buildings: versionedSource,
  canopy_height: versionedSource,
  ghs_pop: versionedSource,
  wikidata: unversionedSource,
})

// `ranking.json`

const rankingRowSchema = z.object({
  rank: z.int().positive(),
  slug: capitalSlugSchema,
  name: namesSchema,
  country: countrySchema,
  residents: z.int().nonnegative(),
  shares: sharesSchema,
  placeholder: placeholderSchema,
})

export const rankingSchema = z.object({
  schema_version: schemaVersion,
  release: releaseNameSchema,
  // False while the release holds fewer than the 27 capitals
  complete: z.boolean(),
  // Sorted by the share meeting all three rules; never assume 27 rows
  capitals: z
    .array(rankingRowSchema)
    .max(capitalSlugs.length)
    .refine((rows) => rows.every((row, index) => row.rank === index + 1), {
      message: "Ranks must run from 1, in the order of the rows",
    }),
})

// `capitals.json`

/** A closed ring, in metres from the capital's centre (x east, y north) */
const ringSchema = z
  .array(z.tuple([z.number(), z.number()]))
  .min(4)
  .refine(
    (ring) => {
      const [first, last] = [ring[0], ring.at(-1)]
      return first[0] === last?.[0] && first[1] === last[1]
    },
    { message: "A ring must be closed" }
  )

const capitalSchema = z.object({
  slug: capitalSlugSchema,
  name: namesSchema,
  // As written locally, for search
  local_name: z.string().min(1),
  // BCP 47 language of the local names (streets and parks)
  language: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/),
  country: countrySchema,
  residents: z.int().nonnegative(),
  centre: lonLatSchema,
  // Where the enlarged outline is drawn on Home
  display: lonLatSchema,
  // Square root of the city's area in km²
  km: z.number().positive(),
  // One entry per polygon: its rings, exterior first, then holes
  outline: z.array(z.array(ringSchema).min(1)).min(1),
  placeholder: placeholderSchema,
})

export const capitalsSchema = z.object({
  schema_version: schemaVersion,
  release: releaseNameSchema,
  complete: z.boolean(),
  // Sorted by slug
  capitals: z.array(capitalSchema).max(capitalSlugs.length),
})

// `capitals/<slug>/summary.json`

/** The lowest and highest zoom of an archive */
const zoomRangeSchema = z.tuple([z.int().nonnegative(), z.int().nonnegative()])

export const summarySchema = z.object({
  schema_version: schemaVersion,
  release: releaseNameSchema,
  slug: capitalSlugSchema,
  name: namesSchema,
  local_name: z.string().min(1),
  language: capitalSchema.shape.language,
  country: countrySchema,
  residents: z.int().nonnegative(),
  shares: sharesSchema,
  // Where the guide's pulse sits on the city overview
  suggested: lonLatSchema,
  centre: lonLatSchema,
  // West, south, east, north
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  area_km2: z.number().positive(),
  // Every character of the names drawn on the map, without the space
  label_chars: z.string(),
  zooms: z.object({
    grid: zoomRangeSchema,
    city: zoomRangeSchema,
    evidence: z.int().nonnegative(),
  }),
  sources: capitalSourcesSchema,
  placeholder: placeholderSchema,
})

// `sources.json`

function sourceSchema<Id extends string>(id: Id) {
  return z.object({
    id: z.literal(id),
    name: z.string().min(1),
    // Several versions are joined with ", "; null without a version
    version: z.string().min(1).nullable(),
    // When capitals differ, the interval over the capitals of the release
    date: dateSchema,
    licence: z.string().min(1),
    licence_url: z.url(),
    // The credit to show, as it must be written
    attribution: z.string().min(1),
    url: z.url(),
  })
}

export const sourcesSchema = z.object({
  schema_version: schemaVersion,
  release: releaseNameSchema,
  // Always these six, in this order
  sources: z.tuple([
    sourceSchema("osm"),
    sourceSchema("osm_land_polygons"),
    sourceSchema("overture_buildings"),
    sourceSchema("canopy_height"),
    sourceSchema("ghs_pop"),
    sourceSchema("wikidata"),
  ]),
  // Per capital of the release, as in its summary
  capitals: z.partialRecord(capitalSlugSchema, capitalSourcesSchema),
})

// `capitals/<slug>/evidence.pmtiles`: one building of a tile

/** A reference to a tree or a point listed once in the tile */
const tileRef = z.int().nonnegative()

/** A met (1) or failed (0) rule */
const ruleFlag = z.union([z.literal(0), z.literal(1)])

/**
 * The evidence of one building, as an evidence tile holds it: its results,
 * and per facade the trees it sees. Values are rounded towards the flags, so
 * they never contradict them (the canopy down, the walk and the share of
 * residents seeing 3 trees up).
 */
export const evidenceBuildingSchema = z.object({
  // Rule 3, rule 30, rule 300
  rules: z.tuple([ruleFlag, ruleFlag, ruleFlag]),
  // Modelled, so a building may have a fraction of a resident, or none
  residents: z.number().nonnegative(),
  // Share of its residents behind facades that see 3 trees or more
  share3: shareSchema,
  // Share of the land within 500 m covered by tree crowns
  canopy: shareSchema,
  // Walk to the nearest park or forest in metres; 0 when it touches one,
  // null when no path within 100 m leads to one
  walk: z.int().nonnegative().nullable(),
  // The green space reached, by its id in the tile
  park: z.int().nonnegative().nullable(),
  route: z.array(tileRef).nullable(),
  facades: z.object({
    // The id of its first facade; the others follow it. Null without facades
    first: z.int().positive().nullable(),
    // Per facade, the trees it sees and where each is seen from
    seen: z.array(z.array(tileRef)),
    from: z.array(z.array(tileRef)),
  }),
})

/** A green space of an evidence tile, without its outline */
export const evidenceParkSchema = z.object({
  // Null when it has no name
  name: z.string().min(1).nullable(),
  kind: z.enum(["park", "garden", "nature_reserve", "forest", "wood"]),
  // Area of the whole green space in hectares
  ha: z.number().positive(),
})

// `capitals/<slug>/city.pmtiles`, layer `facades`: one facade's attributes

/** Where a facade looks, from true north */
export const orientations = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
] as const

export const facadeAttributesSchema = z.object({
  // The facade's id, and its building's
  sid: z.int().positive(),
  b: z.int().positive(),
  // Whether it sees 3 trees or more, and how many it sees
  ok: ruleFlag,
  n: z.int().nonnegative(),
  orient: z.enum(orientations),
  // Its share of the building's residents, by length
  res: z.number().nonnegative(),
})

export type Names = z.infer<typeof namesSchema>
export type Shares = z.infer<typeof sharesSchema>
export type CapitalSources = z.infer<typeof capitalSourcesSchema>
export type Ranking = z.infer<typeof rankingSchema>
export type RankingRow = Ranking["capitals"][number]
export type Capitals = z.infer<typeof capitalsSchema>
export type Capital = Capitals["capitals"][number]
export type Summary = z.infer<typeof summarySchema>
export type Sources = z.infer<typeof sourcesSchema>
export type EvidenceBuilding = z.infer<typeof evidenceBuildingSchema>
export type EvidencePark = z.infer<typeof evidenceParkSchema>
export type FacadeAttributes = z.infer<typeof facadeAttributesSchema>
export type Orientation = (typeof orientations)[number]

/** The schema of each kind of release file the data API returns */
export const releaseFileSchemas = {
  ranking: rankingSchema,
  capitals: capitalsSchema,
  sources: sourcesSchema,
  summary: summarySchema,
}

export type ReleaseFileData = {
  [Kind in keyof typeof releaseFileSchemas]: z.infer<
    (typeof releaseFileSchemas)[Kind]
  >
}
