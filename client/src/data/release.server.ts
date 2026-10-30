import { env } from "@/env"
import { capitalSlugs } from "@/lib/capitals"
import {
  entityTag,
  hasPlaceholders,
  releaseFilePath,
  type JsonEncoding,
  type ReleaseFile,
} from "./api"
import { bucketConfig } from "./bucket-config"
import { bucketReleaseFiles } from "./bucket-release-files.server"
import { compress } from "./compress.server"
import { localReleaseFiles } from "./local-release-files.server"
import type { ReleaseFiles } from "./release-files"
import { s3BucketObjects } from "./s3-bucket-objects.server"
import { releaseFileSchemas, type ReleaseFileData } from "./schemas"

/** A file of the release, validated, with the body and tag the API sends */
export type ReleaseEntry<Kind extends ReleaseFile["kind"]> = {
  data: ReleaseFileData[Kind]
  body: string
  etag: string
  placeholder: boolean
  /** The body compressed, made once per entry and encoding */
  encoded: (encoding: JsonEncoding) => Promise<Uint8Array<ArrayBuffer>>
}

/**
 * The files of the release in use, its JSON files and its tile archives: in
 * the storage bucket once one is set (the deployed site), otherwise in the
 * release folder (development and tests)
 */
const bucket = bucketConfig(env)

export const releaseFiles: ReleaseFiles = bucket
  ? bucketReleaseFiles(s3BucketObjects(bucket), env.VITE_DATA_RELEASE)
  : localReleaseFiles(env.DATA_RELEASE_DIR)

/*
 * In production, each file is read once per process and kept in memory. Only
 * files of the release in use with a known slug get here, so the cache holds
 * at most 57 entries: ranking, capitals, sources, and the 27 summaries and
 * outlines.
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
  const text = await releaseFiles.readText(path)
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
  if (
    (file.kind === "summary" || file.kind === "outline") &&
    "slug" in data &&
    data.slug !== file.slug
  ) {
    throw new Error(`${path} is the ${file.kind} of "${data.slug}"`)
  }

  const body = JSON.stringify(data)
  const encodings = new Map<JsonEncoding, Promise<Uint8Array<ArrayBuffer>>>()
  return {
    data,
    body,
    etag: await entityTag(body),
    placeholder: hasPlaceholders(data),
    encoded: (encoding: JsonEncoding) => {
      let encoded = encodings.get(encoding)
      if (!encoded) {
        encoded = compress(body, encoding, import.meta.env.PROD)
        encodings.set(encoding, encoded)
      }
      return encoded
    },
  }
}

/**
 * Reads every capital's outline, then compresses them one after the other,
 * the largest first, so no visitor waits for it: as hard as Brotli goes,
 * Helsinki's 814 kB take most of a second. Compression runs on Node's worker
 * threads, so the server answers requests meanwhile; one asking for an
 * outline still being compressed shares the same work. A file that fails is
 * reported, and tried again when it is asked for.
 */
async function compressOutlines() {
  const reads = await Promise.allSettled(
    capitalSlugs.map((slug) => readReleaseFile({ kind: "outline", slug }))
  )
  const entries = reads
    .map((result) => (result.status === "fulfilled" ? result.value : null))
    .filter((entry) => entry !== null)
  entries.sort((a, b) => b.body.length - a.body.length)
  for (const entry of entries) {
    await entry.encoded("br")
    await entry.encoded("gzip")
  }
}

// In production, as soon as the server loads the data API
if (import.meta.env.PROD) {
  void compressOutlines().catch((error: unknown) => console.error(error))
}
