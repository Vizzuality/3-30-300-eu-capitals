import type { Shares } from "@/data/schemas"
import { barSegments, type RulesMet } from "@/lib/ranking"
import { cn } from "@/lib/utils"

/** The result colours, by rules met (written out, so that Tailwind finds them) */
export const resultColors: Record<RulesMet, string> = {
  3: "bg-result-3",
  2: "bg-result-2",
  1: "bg-result-1",
  0: "bg-result-0",
}

/** The muted result colours, for the other capitals on a capital's page */
const mutedResultColors: Record<RulesMet, string> = {
  3: "bg-result-muted-3",
  2: "bg-result-muted-2",
  1: "bg-result-muted-1",
  0: "bg-result-muted-0",
}

/**
 * A capital's bar: the shares of its residents meeting all 3, 2, 1 and no
 * rules, always in that order, as rounded segments 2 px apart in the result
 * colours, or in their muted tones. Each segment is at least 4 px wide, so
 * the smallest share stays visible. Decorative: the row it sits in says the
 * same in words.
 */
export function ResultsBar({
  shares,
  muted = false,
  className,
}: {
  shares: Shares
  muted?: boolean
  className?: string
}) {
  const colors = muted ? mutedResultColors : resultColors

  return (
    <span aria-hidden="true" className={cn("flex h-2.5 gap-0.5", className)}>
      {barSegments(shares).map(({ rules, share }) => (
        <span
          key={rules}
          className={cn(
            "block h-full min-w-1 basis-0 rounded-bar",
            colors[rules]
          )}
          style={{ flexGrow: share }}
        />
      ))}
    </span>
  )
}
