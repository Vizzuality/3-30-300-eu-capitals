/*
 * Writes the stand-in release, the development and test data, to
 * `tests/fixtures/release/` from a real release folder written by the
 * pipeline (its JSON files, the capitals' outlines, and the Home map's tiles, `europe.pmtiles`,
 * about 1 MB, copied as they are; the cities' archives are too large to
 * keep with the tests):
 *
 *   pnpm stand-in ../data-processing/data/03_primary/releases/2026-10-all
 *
 * Stockholm is copied from the real release as it is; every other one of the
 * 27 gets placeholder figures and outline from the reference design.
 */
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  capitalsSchema,
  outlineSchema,
  rankingSchema,
  sourcesSchema,
  summarySchema,
  standInRelease,
} from "@/data/schemas"
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
  standInRelease
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

const placeholders = standIn.ranking.capitals.filter((row) => row.placeholder)
console.log(
  `Written ${target}: ${standIn.ranking.capitals.length} capitals, ` +
    `${placeholders.length} of them placeholders`
)
