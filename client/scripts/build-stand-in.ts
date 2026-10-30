/*
 * Writes the stand-in release, the development and test data, to
 * `tests/fixtures/release/` from a real release folder written by the
 * pipeline (its JSON files, the capitals' outlines, the Home map's tiles,
 * `europe.pmtiles`, about 1 MB, and Stockholm's 10 m grid and the map of
 * its overview (water, main roads, district names), `grid.pmtiles` and
 * `context.pmtiles`, 3.2 MB together, copied as they are; the cities' other
 * archives are too large to keep with the tests):
 *
 *   pnpm stand-in ../data-processing/data/03_primary/releases/2026-10-all
 *
 * Stockholm is copied from the real release as it is; every other one of the
 * 27 gets placeholder figures and outline from the reference design. Of
 * Stockholm's city map (86 MB) it keeps a corner, central Södermalm at zooms
 * 14 to 16, and the evidence of the same corner (zoom 15), cut out by the
 * data processing's PMTiles writer (`uv` and the data processing's
 * environment are needed).
 */
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { execFileSync } from "node:child_process"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  capitalsSchema,
  outlineSchema,
  rankingSchema,
  sourcesSchema,
  summarySchema,
  standInRelease,
} from "@/data/schemas"
import { standInCityTiles } from "@/map/capital-archives"
import reference from "@scripts/stand-in/reference-capitals.json" with { type: "json" }
import {
  buildStandIn,
  onlyCapitals,
  standInRealCapitals,
  type ReferenceRow,
} from "./stand-in/build"

const source = process.argv[2]
if (!source) {
  console.error("Usage: pnpm stand-in <folder of a real release>")
  process.exit(1)
}

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, "utf8"))

const ranking = rankingSchema.parse(readJson(join(source, "ranking.json")))
const real = {
  ranking,
  capitals: capitalsSchema.parse(readJson(join(source, "capitals.json"))),
  sources: sourcesSchema.parse(readJson(join(source, "sources.json"))),
  summaries: ranking.capitals.map(({ slug }) =>
    summarySchema.parse(
      readJson(join(source, "capitals", slug, "summary.json"))
    )
  ),
  outlines: ranking.capitals.map(({ slug }) =>
    outlineSchema.parse(
      readJson(join(source, "capitals", slug, "outline.json"))
    )
  ),
}
const standIn = buildStandIn(
  onlyCapitals(real, standInRealCapitals),
  reference as ReferenceRow[],
  standInRelease,
  real.sources.capitals
)

// Written without whitespace, as the pipeline writes its files
const target = fileURLToPath(import.meta.resolve("@fixtures/release"))
rmSync(target, { recursive: true, force: true })
const write = (path: string, data: unknown) => {
  mkdirSync(join(target, path, ".."), { recursive: true })
  writeFileSync(join(target, path), JSON.stringify(data))
}

write("ranking.json", standIn.ranking)
write("capitals.json", standIn.capitals)
write("sources.json", standIn.sources)
for (const summary of standIn.summaries) {
  write(join("capitals", summary.slug, "summary.json"), summary)
}
for (const outline of standIn.outlines) {
  write(join("capitals", outline.slug, "outline.json"), outline)
}
// The Home map draws real tiles, whatever the capitals' figures
copyFileSync(join(source, "europe.pmtiles"), join(target, "europe.pmtiles"))
// The real capitals' overview draws their real grid and water
for (const slug of standInRealCapitals) {
  for (const archive of ["grid.pmtiles", "context.pmtiles"]) {
    const path = join("capitals", slug, archive)
    copyFileSync(join(source, path), join(target, path))
  }
}

// A corner of Stockholm's city map, for the street level, and the evidence
// of its buildings, for a selected building (one zoom, 15, on the same grid)
{
  const { slug, z, x, y, maxZoom } = standInCityTiles
  const evidenceZoom = 15
  const scale = 2 ** (evidenceZoom - z)
  const corners = {
    city: [z, x[0], y[0], x[1], y[1], maxZoom],
    evidence: [
      evidenceZoom,
      x[0] * scale,
      y[0] * scale,
      (x[1] + 1) * scale - 1,
      (y[1] + 1) * scale - 1,
      evidenceZoom,
    ],
  }
  for (const [archive, corner] of Object.entries(corners)) {
    const path = join("capitals", slug, `${archive}.pmtiles`)
    execFileSync(
      "uv",
      [
        "run",
        "python",
        "-m",
        "data_processing.cut_archive",
        resolve(source, path),
        join(target, path),
        ...corner.map(String),
      ],
      {
        cwd: fileURLToPath(new URL("../../data-processing", import.meta.url)),
        stdio: "inherit",
      }
    )
  }
}

const placeholders = standIn.ranking.capitals.filter((row) => row.placeholder)
console.log(
  `Written ${target}: ${standIn.ranking.capitals.length} capitals, ` +
    `${placeholders.length} of them placeholders`
)
