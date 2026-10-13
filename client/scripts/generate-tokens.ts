/*
 * Writes `src/design/tokens.css` from `src/design/tokens.ts`. Run with
 * `pnpm tokens` after changing a token; a unit test fails while the two differ.
 */
import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { tokensCss } from "@/design/tokens-css"

const path = fileURLToPath(import.meta.resolve("@/design/tokens.css"))

writeFileSync(path, tokensCss())
console.log(`Written ${path}`)
