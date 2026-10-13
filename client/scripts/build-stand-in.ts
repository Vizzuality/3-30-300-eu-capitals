/*
 * Writes the stand-in release, the development and test data, to
 * `tests/fixtures/release/` from a real release folder
 * written by the pipeline (only its JSON files are read):
 *
 *   pnpm stand-in ../data-processing/data/03_primary/releases/2026-10-stockholm
 *
 * The capitals of the real release are copied as they are; every other one of
 * the 27 gets placeholder figures and outline from the reference design.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  capitalsSchema,
  rankingSchema,
  sourcesSchema,
  summarySchema,
  standInRelease,
} from "@/data/schemas"
import reference from "@scripts/stand-in/reference-capitals.json" with { type: "json" }
import { buildStandIn, type ReferenceRow } from "./stand-in/build"

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
}
const standIn = buildStandIn(real, reference as ReferenceRow[], standInRelease)

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

const placeholders = standIn.ranking.capitals.filter((row) => row.placeholder)
console.log(
  `Written ${target}: ${standIn.ranking.capitals.length} capitals, ` +
    `${placeholders.length} of them placeholders`
)
