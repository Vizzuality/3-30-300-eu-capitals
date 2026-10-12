/*
 * Writes `src/design/tokens.css` from `src/design/tokens.ts`. Run with
 * `pnpm tokens` after changing a token; a unit test fails while the two differ.
 */
import { writeFileSync } from "node:fs"

import { tokensCss } from "../src/design/tokens-css.ts"

const path = new URL("../src/design/tokens.css", import.meta.url)

writeFileSync(path, tokensCss())
console.log(`Written ${path.pathname}`)
