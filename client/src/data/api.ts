/*
 * The rules of the data API: which addresses are accepted, which release
 * file each one reads, and the headers of the responses. The JSON endpoints:
 *
 *   GET /api/{release}/ranking          ranking.json
 *   GET /api/{release}/capitals         capitals.json
 *   GET /api/{release}/capitals/{slug}  capitals/{slug}/summary.json
 *   GET /api/{release}/capitals/{slug}/outline  capitals/{slug}/outline.json
 *   GET /api/{release}/sources          sources.json
 */
import * as z from "zod"

import type { CapitalSlug } from "@/lib/capitals"
import {
  capitalSlugSchema,
  standInRelease,
  type ReleaseFileData,
} from "./schemas"

/** A file of the release that the API can return */
export type ReleaseFile =
  | { kind: "ranking" }
  | { kind: "capitals" }
  | { kind: "sources" }
  | { kind: "summary"; slug: CapitalSlug }
  | { kind: "outline"; slug: CapitalSlug }

/**
 * The accepted paths after `/api/`, as segments. The release must be the one
 * in use and the slug one of the 27 capitals; any other path is refused
 * before anything is read.
 */
function requestSchema(release: string) {
  const releaseSegment = z.literal(release)

  return z.union([
    z
      .tuple([releaseSegment, z.literal("ranking")])
      .transform((): ReleaseFile => ({ kind: "ranking" })),
    z
      .tuple([releaseSegment, z.literal("capitals")])
      .transform((): ReleaseFile => ({ kind: "capitals" })),
    z
      .tuple([releaseSegment, z.literal("capitals"), capitalSlugSchema])
      .transform(([, , slug]): ReleaseFile => ({ kind: "summary", slug })),
    z
      .tuple([
        releaseSegment,
        z.literal("capitals"),
        capitalSlugSchema,
        z.literal("outline"),
      ])
      .transform(([, , slug]): ReleaseFile => ({ kind: "outline", slug })),
    z
      .tuple([releaseSegment, z.literal("sources")])
      .transform((): ReleaseFile => ({ kind: "sources" })),
  ])
}

/**
 * The release file asked for by a path after `/api/` (`stand-in/ranking`),
 * or null when the path is not one of the endpoints of the release in use
 */
export function matchDataRequest(
  path: string,
  release: string
): ReleaseFile | null {
  const result = requestSchema(release).safeParse(path.split("/"))
  return result.success ? result.data : null
}

/** The address of a release file in the data API */
export function dataUrl(file: ReleaseFile, release: string) {
  const resource =
    file.kind === "summary"
      ? `capitals/${file.slug}`
      : file.kind === "outline"
        ? `capitals/${file.slug}/outline`
        : file.kind
  return `/api/${release}/${resource}`
}

/** Where a file is in the release folder */
export function releaseFilePath(file: ReleaseFile) {
  return file.kind === "summary" || file.kind === "outline"
    ? `capitals/${file.slug}/${file.kind}.json`
    : `${file.kind}.json`
}

/*
 * The tile endpoints: one tile of an archive of the release, by its zoom,
 * column and row on the Web Mercator tile grid.
 *
 *   GET /api/{release}/europe/tiles/{z}/{x}/{y}                europe.pmtiles
 *   GET /api/{release}/capitals/{slug}/tiles/grid/{z}/{x}/{y}  capitals/{slug}/grid.pmtiles
 *   GET /api/{release}/capitals/{slug}/tiles/city/{z}/{x}/{y}  capitals/{slug}/city.pmtiles
 *   GET /api/{release}/capitals/{slug}/tiles/context/{z}/{x}/{y}  capitals/{slug}/context.pmtiles
 */

/**
 * A capital's archives of tiles: its 10 m grid, its city map, and the water
 * of the map around it
 */
export const capitalTileArchives = ["grid", "city", "context"] as const

export type CapitalTileArchive = (typeof capitalTileArchives)[number]

/** An archive of tiles that the API can read from */
export type TileArchive =
  | { kind: "europe" }
  | { kind: CapitalTileArchive; slug: CapitalSlug }

/** A tile asked for: its archive, then its place on the tile grid */
export type TileRequest = {
  archive: TileArchive
  z: number
  x: number
  y: number
}

/** The deepest zoom an address may ask for; each archive has its own range */
export const deepestTileZoom = 22

// A zoom, column or row: a whole number written without leading zeros
const tileNumber = z
  .string()
  .regex(/^(0|[1-9]\d{0,7})$/)
  .transform(Number)

function tileRequestSchema(release: string) {
  const releaseSegment = z.literal(release)
  const place = [tileNumber, tileNumber, tileNumber] as const

  return z
    .union([
      z
        .tuple([
          releaseSegment,
          z.literal("europe"),
          z.literal("tiles"),
          ...place,
        ])
        .transform(([, , , zoom, x, y]): TileRequest => ({
          archive: { kind: "europe" },
          z: zoom,
          x,
          y,
        })),
      z
        .tuple([
          releaseSegment,
          z.literal("capitals"),
          capitalSlugSchema,
          z.literal("tiles"),
          z.enum(capitalTileArchives),
          ...place,
        ])
        .transform(([, , slug, , kind, zoom, x, y]): TileRequest => ({
          archive: { kind, slug },
          z: zoom,
          x,
          y,
        })),
    ])
    .refine(
      ({ z: zoom, x, y }) =>
        zoom <= deepestTileZoom && x < 2 ** zoom && y < 2 ** zoom,
      "The tile is not on the tile grid"
    )
}

/**
 * The tile asked for by a path after `/api/`
 * (`stand-in/europe/tiles/3/4/2`), or null when the path is not a tile of
 * the release in use: another release, another capital or archive, or a
 * place outside the tile grid
 */
export function matchTileRequest(
  path: string,
  release: string
): TileRequest | null {
  const result = tileRequestSchema(release).safeParse(path.split("/"))
  return result.success ? result.data : null
}

/** Where an archive is in the release folder */
export function tileArchivePath(archive: TileArchive) {
  return archive.kind === "europe"
    ? "europe.pmtiles"
    : `capitals/${archive.slug}/${archive.kind}.pmtiles`
}

/**
 * The address of an archive's tiles in the data API, with `{z}`, `{x}` and
 * `{y}` for deck.gl's tile layers to fill in
 */
export function tileUrlTemplate(archive: TileArchive, release: string) {
  const tiles =
    archive.kind === "europe"
      ? "europe/tiles"
      : `capitals/${archive.slug}/tiles/${archive.kind}`
  return `/api/${release}/${tiles}/{z}/{x}/{y}`
}

/**
 * The `Content-Type` of an archive's tiles, from the type its header gives
 * (the numbers of the PMTiles format): vector tiles for the maps, PNG images
 * for the grid. Any other type cannot be served.
 */
export function tileContentType(tileType: number) {
  switch (tileType) {
    case 1:
      return "application/vnd.mapbox-vector-tile"
    case 2:
      return "image/png"
    default:
      throw new Error(`Tiles of an unknown type (${tileType})`)
  }
}

/**
 * The `Content-Encoding` of tiles stored with an archive's compression (the
 * numbers of the PMTiles format: 1 none, 2 gzip, 3 Brotli, 4 Zstandard), or
 * undefined when they are stored as they are. An unknown compression (0)
 * cannot be served.
 */
export function tileEncoding(compression: number): string | undefined {
  switch (compression) {
    case 1:
      return undefined
    case 2:
      return "gzip"
    case 3:
      return "br"
    case 4:
      return "zstd"
    default:
      throw new Error(`Tiles compressed in an unknown way (${compression})`)
  }
}

/**
 * A tile, exactly as stored (still compressed), or `304 Not Modified` if
 * the browser has it
 */
export function tileResponse({
  body,
  contentType,
  encoding,
  etag,
  ifNoneMatch,
  caching,
}: {
  body: ArrayBuffer
  contentType: string
  encoding: string | undefined
  etag: string
  ifNoneMatch: string | null
  caching: string
}) {
  const headers = { "Cache-Control": caching, ETag: etag }

  if (isNotModified(ifNoneMatch, etag)) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(body, {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": contentType,
      ...(encoding ? { "Content-Encoding": encoding } : {}),
    },
  })
}

/** A place of the archive's grid with nothing in it */
export function emptyTileResponse(etag: string, caching: string) {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": caching, ETag: etag },
  })
}

/** A published release never changes, so browsers can keep its files for good */
export const immutable = "public, max-age=31536000, immutable"

/** Browsers check with the API on each use, and get a 304 if nothing changed */
export const revalidate = "no-cache"

/**
 * How browsers may keep a release file. Only a production build serving a
 * real, published release lets them keep it for good. In development, and
 * for the stand-in release or any file with placeholder data, the files can
 * change from one build to the next, so browsers check each time.
 */
export function cacheControl({
  production,
  release,
  placeholder,
}: {
  production: boolean
  release: string
  placeholder: boolean
}) {
  return production && release !== standInRelease && !placeholder
    ? immutable
    : revalidate
}

/** Whether a release file holds placeholder data (only the stand-in has any) */
export function hasPlaceholders(data: ReleaseFileData[ReleaseFile["kind"]]) {
  if ("placeholder" in data && data.placeholder) {
    return true
  }
  // The rows of the ranking and of the capitals
  return (
    "capitals" in data &&
    Array.isArray(data.capitals) &&
    (data.capitals as Array<{ placeholder?: true }>).some(
      ({ placeholder }) => placeholder
    )
  )
}

/** A strong entity tag for a response body: a hash of its content */
export async function entityTag(body: string | ArrayBuffer) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    typeof body === "string" ? new TextEncoder().encode(body) : body
  )
  const hex = Array.from(new Uint8Array(digest).subarray(0, 16), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
  return `"${hex}"`
}

/**
 * Whether the browser already has this version: one of the tags of its
 * `If-None-Match` header matches (weak tags count), or the header is `*`
 */
export function isNotModified(ifNoneMatch: string | null, etag: string) {
  if (ifNoneMatch === null) {
    return false
  }
  if (ifNoneMatch.trim() === "*") {
    return true
  }
  return ifNoneMatch
    .split(",")
    .some((tag) => tag.trim().replace(/^W\//, "") === etag)
}

/** How a JSON file can travel compressed, best first */
export type JsonEncoding = "br" | "gzip"

/**
 * The best compression the browser accepts (`Accept-Encoding`): Brotli,
 * then gzip, or none. A coding refused with `q=0` is not used.
 */
export function negotiateEncoding(
  acceptEncoding: string | null
): JsonEncoding | undefined {
  const accepted = new Map(
    (acceptEncoding ?? "").split(",").map((part) => {
      const [coding, ...parameters] = part.trim().toLowerCase().split(";")
      const q = parameters
        .map((parameter) => /^\s*q=([\d.]+)\s*$/.exec(parameter)?.[1])
        .find((value) => value !== undefined)
      return [coding.trim(), q === undefined ? 1 : Number(q)] as const
    })
  )
  const wildcard = accepted.get("*") ?? 0
  return (["br", "gzip"] as const).find(
    (coding) => (accepted.get(coding) ?? wildcard) > 0
  )
}

/**
 * The entity tag of a body sent compressed: another representation, so
 * another tag
 */
export function encodedTag(etag: string, encoding: JsonEncoding | undefined) {
  return encoding ? `${etag.slice(0, -1)}-${encoding}"` : etag
}

/**
 * A JSON file of the release, compressed when `encoding` is given, or
 * `304 Not Modified` if the browser has it
 */
export function jsonResponse(
  body: string | Uint8Array<ArrayBuffer>,
  etag: string,
  ifNoneMatch: string | null,
  caching: string,
  encoding?: JsonEncoding
) {
  const headers = {
    "Cache-Control": caching,
    ETag: etag,
    Vary: "Accept-Encoding",
  }

  if (isNotModified(ifNoneMatch, etag)) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(body, {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": "application/json",
      ...(encoding ? { "Content-Encoding": encoding } : {}),
    },
  })
}

/** Any address the API does not serve */
export function notFoundResponse() {
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  })
}

/** The API only reads */
export function methodNotAllowedResponse() {
  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" },
  })
}
