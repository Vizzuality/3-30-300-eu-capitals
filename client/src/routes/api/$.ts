import { createFileRoute } from "@tanstack/react-router"

import { env } from "@/env"
import {
  cacheControl,
  emptyTileResponse,
  encodedTag,
  isNotModified,
  jsonResponse,
  matchDataRequest,
  negotiateEncoding,
  matchTileRequest,
  methodNotAllowedResponse,
  notFoundResponse,
  tileResponse,
  type TileRequest,
} from "@/data/api"
import { readReleaseFile } from "@/data/release.server"
import { readTile } from "@/data/tiles.server"

/*
 * The data API, under one route so that every address is checked against
 * the same lists before anything is read: the JSON files of the release
 * (compressed when the browser accepts it) and the tiles of its archives. Any other address under `/api/` is a 404. HEAD
 * is answered like GET, without the body.
 */
export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        // The rest of the path after `/api/`, as the router names it
        // oxlint-disable-next-line no-underscore-dangle
        const path = params._splat ?? ""
        const ifNoneMatch = request.headers.get("If-None-Match")

        const tile = matchTileRequest(path, env.VITE_DATA_RELEASE)
        if (tile) {
          return serveTile(tile, ifNoneMatch)
        }

        const file = matchDataRequest(path, env.VITE_DATA_RELEASE)
        if (!file) {
          return notFoundResponse()
        }

        const entry = await readReleaseFile(file)
        if (!entry) {
          return notFoundResponse()
        }

        // Compressed when the browser accepts it, each way with its own tag
        const encoding = negotiateEncoding(
          request.headers.get("Accept-Encoding")
        )
        const etag = encodedTag(entry.etag, encoding)
        return jsonResponse(
          encoding && !isNotModified(ifNoneMatch, etag)
            ? await entry.encoded(encoding)
            : entry.body,
          etag,
          ifNoneMatch,
          cacheControl({
            production: import.meta.env.PROD,
            release: env.VITE_DATA_RELEASE,
            placeholder: entry.placeholder,
          }),
          encoding
        )
      },
      ANY: () => methodNotAllowedResponse(),
    },
  },
})

async function serveTile(tile: TileRequest, ifNoneMatch: string | null) {
  const entry = await readTile(tile)
  if (!entry) {
    return notFoundResponse()
  }

  // Tiles hold no placeholder figures: only the release decides
  const caching = cacheControl({
    production: import.meta.env.PROD,
    release: env.VITE_DATA_RELEASE,
    placeholder: false,
  })
  if (entry.kind === "empty") {
    return emptyTileResponse(entry.etag, caching)
  }
  return tileResponse({ ...entry, ifNoneMatch, caching })
}
