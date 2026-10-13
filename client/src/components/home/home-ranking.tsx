import { Ranking } from "@/components/ranking/ranking"
import { useCapitals, useRanking } from "@/data/queries"

/**
 * The ranking of the 27 capitals on Home, from the release: under the guide
 * on desktop, after the map band on phones. It arrives as the last part of
 * the panel's content.
 */
export function HomeRanking() {
  const ranking = useRanking()
  const { capitals } = useCapitals()

  return <Ranking ranking={ranking} capitals={capitals} />
}
