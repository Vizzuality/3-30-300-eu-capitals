/*
 * Lets Node.js run the scripts with the import aliases of the application
 * (`@/`, `@fixtures/`…), read from the `paths` of tsconfig.json, as TypeScript,
 * Vite, Vitest and Playwright read them. An import without an extension finds
 * its `.ts` file, as with Vite. Used as `node --import ./scripts/register-aliases.ts`
 * from the client folder.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { registerHooks } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import ts from "typescript"

const tsconfig = resolve("tsconfig.json")
const { config } = ts.parseConfigFileTextToJson(
  tsconfig,
  readFileSync(tsconfig, "utf8")
)
const paths: Record<string, string[]> = config.compilerOptions.paths

// "@/*": ["./src/*"] becomes ["@/", "<client>/src/"]
const aliases = Object.entries(paths).map(([alias, [target]]) => [
  alias.replace(/\*$/, ""),
  resolve(dirname(tsconfig), target.replace(/\*$/, "")),
])

/** The file a path names, trying the extensions Vite tries */
function existing(path: string) {
  for (const candidate of [
    path,
    `${path}.ts`,
    `${path}.tsx`,
    `${path}/index.ts`,
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate
    }
  }
  // A folder (where a script writes) or a file to create
  return path
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    for (const [alias, target] of aliases) {
      if (specifier.startsWith(alias)) {
        const path = existing(`${target}/${specifier.slice(alias.length)}`)
        return { url: pathToFileURL(path).href, shortCircuit: true }
      }
    }
    if (specifier.startsWith("./") && context.parentURL?.startsWith("file:")) {
      const parent = dirname(fileURLToPath(context.parentURL))
      const path = existing(resolve(parent, specifier))
      return nextResolve(pathToFileURL(path).href, context)
    }
    return nextResolve(specifier, context)
  },
})
