import type { CapitalTileArchive } from "@/data/api"
import { standInRelease, type Summary } from "@/data/schemas"

/*
 * Which of a capital's archives of tiles its map asks for, so the map never
 * asks for tiles the release does not have. A capital with placeholder
 * figures has no tiles at all: its outline and figures are made up. The
 * stand-in release, the development and test data, keeps the real capitals'
 * grids and overview water but none of their city maps, which are too large
 * to keep with the tests.
 */
export function capitalArchives(
  summary: Pick<Summary, "placeholder">,
  release: string
): Record<CapitalTileArchive, boolean> {
  const real = summary.placeholder !== true
  return {
    grid: real,
    context: real,
    city: real && release !== standInRelease,
  }
}
