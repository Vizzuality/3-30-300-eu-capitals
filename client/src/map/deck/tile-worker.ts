import { MVTLoader } from "@loaders.gl/mvt"

import { cityTile } from "./city-tile-decode"
import { contextTile } from "./context-tile-decode"
import type {
  TileRequest,
  TileWorkerAnswer,
  TileWorkerQuestion,
} from "./tile-decoder"

/*
 * The map's own worker for vector tiles: it decodes a tile with loaders.gl's
 * MVT parser and sends the result back with its buffers transferred, not
 * copied. It is bundled with the site, so no worker is ever loaded from
 * another origin (deck.gl's `MVTLayer` otherwise has loaders.gl fetch its
 * worker from a CDN).
 */

// The worker's own scope (the site's TypeScript setup knows the page's)
const scope = self as unknown as {
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<TileWorkerQuestion>) => void
  ) => void
  postMessage: (message: TileWorkerAnswer, transfer: Array<ArrayBuffer>) => void
}

type TileIndex = { x: number; y: number; z: number }

/** Every layer of a tile, decoded as one collection, as `MVTLayer` draws it */
function wholeTile(buffer: ArrayBuffer, index: TileIndex, binary: boolean) {
  return MVTLoader.parseSync?.(buffer, {
    mvt: {
      shape: binary ? "binary" : "geojson",
      coordinates: "local",
      tileIndex: index,
      layerProperty: "layerName",
    },
  } as never)
}

function decode(buffer: ArrayBuffer, index: TileIndex, request: TileRequest) {
  switch (request.kind) {
    case "binary":
      return wholeTile(buffer, index, true)
    case "geojson":
      return wholeTile(buffer, index, false)
    case "city":
      return cityTile(buffer, index, request)
    case "context":
      return contextTile(buffer, index, request)
  }
}

/** The buffers of every typed array in what is sent back, once each */
function buffersOf(value: unknown, found = new Set<ArrayBuffer>()) {
  if (ArrayBuffer.isView(value)) {
    found.add(value.buffer as ArrayBuffer)
  } else if (Array.isArray(value)) {
    for (const item of value) {
      buffersOf(item, found)
    }
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      buffersOf(item, found)
    }
  }
  return found
}

scope.addEventListener("message", ({ data }) => {
  const { id, buffer, index, request } = data
  let answer: TileWorkerAnswer
  try {
    answer = { id, result: decode(buffer, index, request) }
  } catch (error) {
    answer = { id, error: String(error) }
  }
  // Plain features (GeoJSON) hold no typed arrays to transfer
  const transfer = request.kind === "geojson" ? [] : [...buffersOf(answer)]
  scope.postMessage(answer, transfer)
})
