import { PMTiles, type Source } from "pmtiles"
import { vi } from "vitest"

import cityArchive from "@fixtures/release/capitals/stockholm/city.pmtiles?url"
import evidenceArchive from "@fixtures/release/capitals/stockholm/evidence.pmtiles?url"

/*
 * The tiles a selected building is read from (Stockholm's city map and
 * evidence, in the stand-in's corner of Södermalm), served in the browser
 * as the data API serves them: the panel reads a building from them, as it
 * does on the site. Every other address goes to the network as usual.
 */

// The browser's own fetch, kept once for every test file of the page (a
// later file would otherwise keep the earlier one's stand-in)
const kept = globalThis as typeof globalThis & {
  fetchOnline?: typeof window.fetch
}
kept.fetchOnline ??= window.fetch.bind(window)
const fetchOnline = kept.fetchOnline

/** An archive read whole, once, from the test server */
function archiveSource(url: string): Source {
  let bytes: Promise<ArrayBuffer> | undefined
  return {
    getKey: () => url,
    async getBytes(offset, length) {
      bytes ??= fetchOnline(url).then((response) => response.arrayBuffer())
      return { data: (await bytes).slice(offset, offset + length) }
    },
  }
}

const archives = {
  city: new PMTiles(archiveSource(cityArchive)),
  evidence: new PMTiles(archiveSource(evidenceArchive)),
}

const tileAddress =
  /^\/api\/stand-in\/capitals\/stockholm\/tiles\/(city|evidence)\/(\d+)\/(\d+)\/(\d+)$/

/** Answers the data API's tile addresses from the stand-in's archives */
export function serveStandInTiles() {
  vi.spyOn(window, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      window.location.href
    )
    const match = tileAddress.exec(url.pathname)
    if (!match) {
      return fetchOnline(input, init)
    }
    const [, archive, z, x, y] = match
    // The tile, uncompressed, as the browser hands it on; none is a 204
    const tile = await archives[archive as keyof typeof archives].getZxy(
      Number(z),
      Number(x),
      Number(y)
    )
    return tile
      ? new Response(tile.data, { status: 200 })
      : new Response(null, { status: 204 })
  })
}
