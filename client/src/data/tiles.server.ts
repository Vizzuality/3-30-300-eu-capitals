import { PMTiles, SharedPromiseCache, type Source } from "pmtiles"

import {
  entityTag,
  tileArchivePath,
  tileEncoding,
  type TileArchive,
  type TileRequest,
} from "./api"
import { releaseFiles } from "./release.server"

/*
 * The tiles of the release's archives, read with the PMTiles reader: it reads
 * an archive's header and index once, then each tile with one read of its
 * bytes. Tiles are returned exactly as stored, still compressed, so the API
 * sends them with their `Content-Encoding` and never decompresses them (the
 * reader only decompresses the archive's own index).
 */

/** The release has no such archive */
class MissingArchive extends Error {}

/** An archive of the release, as the PMTiles reader reads it */
function archiveSource(path: string): Source {
  return {
    getKey: () => path,
    async getBytes(offset, length) {
      const data = await releaseFiles.readBytes(path, offset, length)
      if (data === null) {
        throw new MissingArchive(path)
      }
      return { data }
    },
  }
}

// Tiles as they are stored, still compressed
const asStored = async (data: ArrayBuffer) => data

/*
 * In production, one reader per archive for the life of the process, so
 * each archive's header and index are read once (at most 28 archives:
 * Europe and the 27 cities). In development, a reader per request, so a
 * rebuilt archive shows on the next reload, as the JSON files do.
 */
const readers = new Map<string, PMTiles>()

function readerOf(archive: TileArchive) {
  const path = tileArchivePath(archive)
  let reader = import.meta.env.PROD ? readers.get(path) : undefined
  if (!reader) {
    reader = new PMTiles(
      archiveSource(path),
      new SharedPromiseCache(),
      asStored
    )
    if (import.meta.env.PROD) {
      readers.set(path, reader)
    }
  }
  return reader
}

/** A tile, or a place with nothing in it, or nothing to serve at all */
export type TileEntry =
  | {
      kind: "tile"
      body: ArrayBuffer
      encoding: string | undefined
      etag: string
    }
  | { kind: "empty"; etag: string }
  | null

// Every empty place of every archive is the same, empty body
const emptyTag = entityTag(new ArrayBuffer(0))

/**
 * A tile of the release in use: the tile, as stored; `empty` for a place of
 * the archive's grid that has nothing (the API answers 204); null when the
 * release has no such archive or the zoom is outside the archive's range (a
 * 404)
 */
export async function readTile({
  archive,
  z,
  x,
  y,
}: TileRequest): Promise<TileEntry> {
  const reader = readerOf(archive)
  try {
    const header = await reader.getHeader()
    if (z < header.minZoom || z > header.maxZoom) {
      return null
    }
    const tile = await reader.getZxy(z, x, y)
    if (!tile || tile.data.byteLength === 0) {
      return { kind: "empty", etag: await emptyTag }
    }
    return {
      kind: "tile",
      body: tile.data,
      encoding: tileEncoding(header.tileCompression),
      etag: await entityTag(tile.data),
    }
  } catch (error) {
    if (error instanceof MissingArchive) {
      readers.delete(tileArchivePath(archive))
      return null
    }
    throw error
  }
}
