import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import type { ReleaseFiles } from "./release-files"

/**
 * The files of a release in a folder on this machine. A relative folder is
 * resolved from the working directory (the client folder when run with pnpm).
 */
export function localReleaseFiles(folder: string): ReleaseFiles {
  const root = resolve(folder)

  return {
    async readText(path) {
      try {
        return await readFile(resolve(root, path), "utf8")
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null
        }
        throw error
      }
    },
  }
}
