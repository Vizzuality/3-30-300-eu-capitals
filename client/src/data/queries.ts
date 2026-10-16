import { queryOptions, useSuspenseQuery } from "@tanstack/react-query"
import { notFound } from "@tanstack/react-router"
import { createIsomorphicFn } from "@tanstack/react-start"

import { env } from "@/env"
import type { CapitalSlug } from "@/lib/capitals"
import { dataUrl, type ReleaseFile } from "./api"
import { readReleaseFile } from "./release.server"
import { releaseFileSchemas, type ReleaseFileData } from "./schemas"

type Data<File extends ReleaseFile> = ReleaseFileData[File["kind"]] | null

/*
 * A file of the release in use, or null when the release does not have it.
 * On the server (rendering and prerendering a page) it is read directly, as
 * the data API reads it; in the browser it is asked of the data API.
 */
const fetchReleaseFile = createIsomorphicFn()
  .server(
    async (file: ReleaseFile) => (await readReleaseFile(file))?.data ?? null
  )
  .client(async (file: ReleaseFile) => {
    const response = await fetch(dataUrl(file, env.VITE_DATA_RELEASE))
    if (response.status === 404) {
      return null
    }
    if (!response.ok) {
      throw new Error(`The data API answered ${response.status}`)
    }
    return releaseFileSchemas[file.kind].parse(await response.json())
  })

function releaseQuery<File extends ReleaseFile>(file: File) {
  return queryOptions({
    queryKey: ["release", env.VITE_DATA_RELEASE, file] as const,
    queryFn: () => fetchReleaseFile(file) as Promise<Data<File>>,
    // A release never changes while the site runs; a page reload starts with
    // an empty cache
    staleTime: "static",
  })
}

export const rankingQuery = () => releaseQuery({ kind: "ranking" })
export const capitalsQuery = () => releaseQuery({ kind: "capitals" })
export const sourcesQuery = () => releaseQuery({ kind: "sources" })
export const summaryQuery = (slug: CapitalSlug) =>
  releaseQuery({ kind: "summary", slug })
/** A capital's city limits, loaded by the map in the browser only */
export const outlineQuery = (slug: CapitalSlug) =>
  releaseQuery({ kind: "outline", slug })

/*
 * Each page's loader puts the data it needs in the cache first, so these
 * read it at once, also in the prerendered HTML. A file the release lacks is
 * a missing page.
 */
function useReleaseFile<File extends ReleaseFile>(
  query: ReturnType<typeof releaseQuery<File>>
) {
  const { data } = useSuspenseQuery(query)
  if (data === null) {
    throw notFound()
  }
  return data
}

export const useRanking = () => useReleaseFile(rankingQuery())
export const useCapitals = () => useReleaseFile(capitalsQuery())
export const useSources = () => useReleaseFile(sourcesQuery())
export const useSummary = (slug: CapitalSlug) =>
  useReleaseFile(summaryQuery(slug))
