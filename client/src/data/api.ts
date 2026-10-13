/*
 * The rules of the data API's JSON endpoints: which addresses are accepted,
 * which release file each one reads, and the headers of the responses.
 *
 *   GET /api/{release}/ranking          ranking.json
 *   GET /api/{release}/capitals         capitals.json
 *   GET /api/{release}/capitals/{slug}  capitals/{slug}/summary.json
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
  const resource = file.kind === "summary" ? `capitals/${file.slug}` : file.kind
  return `/api/${release}/${resource}`
}

/** Where a file is in the release folder */
export function releaseFilePath(file: ReleaseFile) {
  return file.kind === "summary"
    ? `capitals/${file.slug}/summary.json`
    : `${file.kind}.json`
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
export async function entityTag(body: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body)
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

/** A JSON file of the release, or `304 Not Modified` if the browser has it */
export function jsonResponse(
  body: string,
  etag: string,
  ifNoneMatch: string | null,
  caching: string
) {
  const headers = { "Cache-Control": caching, ETag: etag }

  if (isNotModified(ifNoneMatch, etag)) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(body, {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
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
