import type { ReleaseFiles } from "./release-files"

/** The bytes asked of an object: `length` bytes from `offset` */
export type ByteRange = { offset: number; length: number }

/**
 * The objects of the storage bucket, as the S3 client reads them. The client
 * itself stays behind this interface, so the files of a release are read the
 * same way whichever client reads the bucket.
 */
export interface BucketObjects {
  /**
   * The object's bytes, or only those of `range` (fewer at its end, none
   * past it), or null when the bucket has no such object
   */
  get(key: string, range?: ByteRange): Promise<ArrayBuffer | null>
}

/** Where a release's files are in the bucket */
export const releasePrefix = (release: string) => `releases/${release}/`

/** The HTTP `Range` of a read, as the S3 API takes it (both ends included) */
export const rangeHeader = ({ offset, length }: ByteRange) =>
  `bytes=${offset}-${offset + length - 1}`

/**
 * The files of a release in the storage bucket, read through its S3 API on
 * the server only: the browser never sees the bucket or its credentials.
 * Paths are relative to the release, as for a folder.
 */
export function bucketReleaseFiles(
  objects: BucketObjects,
  release: string
): ReleaseFiles {
  const prefix = releasePrefix(release)
  const decoder = new TextDecoder()

  return {
    async readText(path) {
      const data = await objects.get(prefix + path)
      return data === null ? null : decoder.decode(data)
    },

    readBytes: (path, offset, length) =>
      objects.get(prefix + path, { offset, length }),
  }
}
