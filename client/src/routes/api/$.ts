import { createFileRoute } from "@tanstack/react-router"

import { env } from "@/env"
import {
  cacheControl,
  jsonResponse,
  matchDataRequest,
  methodNotAllowedResponse,
  notFoundResponse,
} from "@/data/api"
import { readReleaseFile } from "@/data/release.server"

/*
 * The data API's JSON endpoints, under one route so that every address is
 * checked against the same list before anything is read. Any other address
 * under `/api/` is a 404. HEAD is answered like GET, without the body.
 */
export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        // The rest of the path after `/api/`, as the router names it
        // oxlint-disable-next-line no-underscore-dangle
        const path = params._splat ?? ""
        const file = matchDataRequest(path, env.VITE_DATA_RELEASE)
        if (!file) {
          return notFoundResponse()
        }

        const entry = await readReleaseFile(file)
        if (!entry) {
          return notFoundResponse()
        }

        return jsonResponse(
          entry.body,
          entry.etag,
          request.headers.get("If-None-Match"),
          cacheControl({
            production: import.meta.env.PROD,
            release: env.VITE_DATA_RELEASE,
            placeholder: entry.placeholder,
          })
        )
      },
      ANY: () => methodNotAllowedResponse(),
    },
  },
})
