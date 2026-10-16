import { open, readFile } from "node:fs/promises"
import { resolve } from "node:path"

import type { ReleaseFiles } from "./release-files"

const isMissing = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === "ENOENT"

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
        if (isMissing(error)) {
          return null
        }
        throw error
      }
    },

    async readBytes(path, offset, length) {
      let file
      try {
        file = await open(resolve(root, path), "r")
      } catch (error) {
        if (isMissing(error)) {
          return null
        }
        throw error
      }
      try {
        const buffer = new Uint8Array(length)
        const { bytesRead } = await file.read(buffer, 0, length, offset)
        return buffer.buffer.slice(0, bytesRead)
      } finally {
        await file.close()
      }
    },
  }
}
