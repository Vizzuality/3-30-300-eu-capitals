import type { CityTileRequest } from "./city-tile-decode"

/*
 * Vector tiles fetched from the data API and decoded off the main thread, by
 * a few workers of the site's own (`tile-worker.ts`), bundled with it: no
 * worker or script is ever loaded from another origin.
 */

/** How a tile is decoded: every layer at once, or a city tile layer by layer */
export type TileRequest =
  | { kind: "binary" }
  | { kind: "geojson" }
  | CityTileRequest

export type TileIndex = { x: number; y: number; z: number }

export type TileWorkerQuestion = {
  id: number
  buffer: ArrayBuffer
  index: TileIndex
  request: TileRequest
}

export type TileWorkerAnswer =
  | { id: number; result: unknown; error?: undefined }
  | { id: number; error: string; result?: undefined }

type Pool = {
  workers: Array<Worker>
  pending: Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >
  next: number
}

let pool: Pool | undefined

/** The workers, made on first use: one fewer than the cores, two to four */
function workerPool(): Pool {
  if (pool) {
    return pool
  }
  const size = Math.max(
    2,
    Math.min(4, (navigator.hardwareConcurrency || 4) - 1)
  )
  const made: Pool = { workers: [], pending: new Map(), next: 0 }
  for (let index = 0; index < size; index += 1) {
    const worker = new Worker(new URL("./tile-worker.ts", import.meta.url), {
      type: "module",
    })
    worker.addEventListener(
      "message",
      ({ data }: MessageEvent<TileWorkerAnswer>) => {
        const waiting = made.pending.get(data.id)
        made.pending.delete(data.id)
        if (data.error !== undefined) {
          waiting?.reject(new Error(data.error))
        } else {
          waiting?.resolve(data.result)
        }
      }
    )
    made.workers.push(worker)
  }
  pool = made
  return made
}

/** A tile's bytes decoded by a worker; the buffer is handed over to it */
function decode(
  buffer: ArrayBuffer,
  index: TileIndex,
  request: TileRequest
): Promise<unknown> {
  const current = workerPool()
  const { workers, pending } = current
  const id = current.next
  current.next += 1
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    const question: TileWorkerQuestion = { id, buffer, index, request }
    workers[id % workers.length].postMessage(question, [buffer])
  })
}

/** A tile's address, from a template with `{z}`, `{x}` and `{y}` */
export const tileUrl = (template: string, { x, y, z }: TileIndex) =>
  template
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y))

/**
 * A vector tile, fetched and decoded; null for a place with nothing in it
 * (the data API's 204)
 */
export async function loadTile(
  url: string,
  index: TileIndex,
  request: TileRequest,
  signal?: AbortSignal
): Promise<unknown> {
  const response = await fetch(url, { signal })
  if (response.status === 204) {
    return null
  }
  if (!response.ok) {
    throw new Error(`The data API answered ${response.status} for ${url}`)
  }
  const buffer = await response.arrayBuffer()
  if (signal?.aborted) {
    return null
  }
  return decode(buffer, index, request)
}

// Tiles drawn by several layers (one per drawing group), by address; the
// oldest are forgotten first
const shared = new Map<string, Promise<unknown>>()
const keptTiles = 384

/**
 * A tile fetched and decoded once for every layer that draws it, never
 * cancelled by one of them, since another may be waiting for it
 */
export function sharedTile(
  url: string,
  index: TileIndex,
  request: TileRequest
) {
  let tile = shared.get(url)
  if (tile) {
    // The most recently used last
    shared.delete(url)
    shared.set(url, tile)
    return tile
  }
  tile = loadTile(url, index, request)
  tile.catch(() => shared.delete(url))
  shared.set(url, tile)
  if (shared.size > keptTiles) {
    const oldest = shared.keys().next().value
    if (oldest !== undefined) {
      shared.delete(oldest)
    }
  }
  return tile
}
