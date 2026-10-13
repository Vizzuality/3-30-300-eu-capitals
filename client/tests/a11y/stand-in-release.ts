import type { QueryClient } from "@tanstack/react-query"

import {
  capitalsQuery,
  rankingQuery,
  sourcesQuery,
  summaryQuery,
} from "@/data/queries"
import {
  capitalsSchema,
  rankingSchema,
  sourcesSchema,
  summarySchema,
} from "@/data/schemas"
import capitals from "@fixtures/release/capitals.json"
import ranking from "@fixtures/release/ranking.json"
import sources from "@fixtures/release/sources.json"

const summaries = import.meta.glob<unknown>(
  "@fixtures/release/capitals/*/summary.json",
  { eager: true, import: "default" }
)

/**
 * Puts every file of the stand-in release in the query cache, where the
 * pages' loaders find it: the pages render with realistic data and without
 * the network.
 */
export function withStandInRelease(queryClient: QueryClient) {
  queryClient.setQueryData(
    rankingQuery().queryKey,
    rankingSchema.parse(ranking)
  )
  queryClient.setQueryData(
    capitalsQuery().queryKey,
    capitalsSchema.parse(capitals)
  )
  queryClient.setQueryData(
    sourcesQuery().queryKey,
    sourcesSchema.parse(sources)
  )
  for (const file of Object.values(summaries)) {
    const summary = summarySchema.parse(file)
    queryClient.setQueryData(summaryQuery(summary.slug).queryKey, summary)
  }
  return queryClient
}
