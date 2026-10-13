import { env } from "@/env"
import {
  entityTag,
  hasPlaceholders,
  releaseFilePath,
  type ReleaseFile,
} from "./api"
import { localReleaseFiles } from "./local-release-files.server"
import type { ReleaseFiles } from "./release-files"
import { releaseFileSchemas, type ReleaseFileData } from "./schemas"

/** A file of the release, validated, with the body and tag the API sends */
export type ReleaseEntry<Kind extends ReleaseFile["kind"]> = {
  data: ReleaseFileData[Kind]
  body: string
  etag: string
  placeholder: boolean
}

// The bucket's reader takes this place once the site is deployed
const files: ReleaseFiles = localReleaseFiles(env.DATA_RELEASE_DIR)

/*
 * In production, each file is read once per process and kept in memory. Only
 * files of the release in use with a known slug get here, so the cache holds
 * at most 30 entries: ranking, capitals, sources and the 27 summaries.
 * Requests arriving together share one read. In development, files are read
 * on each request, so a rebuilt stand-in release shows on the next reload.
 */
const cache = new Map<
  string,
  Promise<ReleaseEntry<ReleaseFile["kind"]> | null>
>()

/**
 * A file of the release in use, validated against its schema, or null when
 * the release does not have it (a partial release has fewer capitals). A
 * file that does not match its schema, or that belongs to another release or
 * capital, is an error: the release folder and `VITE_DATA_RELEASE` disagree.
 */
export function readReleaseFile<File extends ReleaseFile>(
  file: File
): Promise<ReleaseEntry<File["kind"]> | null> {
  const path = releaseFilePath(file)
  let entry = import.meta.env.PROD ? cache.get(path) : undefined
  if (!entry) {
    entry = read(file, path)
    if (import.meta.env.PROD) {
      cache.set(path, entry)
    }
    // A failed read is reported, and tried again next time
    entry.catch((error: unknown) => {
      console.error(error)
      cache.delete(path)
    })
  }
  return entry as Promise<ReleaseEntry<File["kind"]> | null>
}

async function read(file: ReleaseFile, path: string) {
  const text = await files.readText(path)
  if (text === null) {
    return null
  }

  const parsed = releaseFileSchemas[file.kind].safeParse(JSON.parse(text))
  if (!parsed.success) {
    throw new Error(
      `${path} does not match its schema: ${parsed.error.message}`
    )
  }

  const data = parsed.data
  const release = env.VITE_DATA_RELEASE
  if (data.release !== release) {
    throw new Error(
      `${path} belongs to release "${data.release}", not to the release in use, "${release}"`
    )
  }
  if (file.kind === "summary" && "slug" in data && data.slug !== file.slug) {
    throw new Error(`${path} is the summary of "${data.slug}"`)
  }

  const body = JSON.stringify(data)
  return {
    data,
    body,
    etag: await entityTag(body),
    placeholder: hasPlaceholders(data),
  }
}
