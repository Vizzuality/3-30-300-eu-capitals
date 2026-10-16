import { promisify } from "node:util"
import { brotliCompress, constants, gzip } from "node:zlib"

import type { JsonEncoding } from "./api"

/*
 * JSON files of the release compressed for the browser, with Node's own
 * zlib. A production server compresses each file once, as hard as Brotli
 * goes (Helsinki's 814 kB outline takes under a second, once), and keeps
 * it; the development server compresses each request quickly instead.
 */

const brotli = promisify(brotliCompress)
const gzipped = promisify(gzip)

export async function compress(
  body: string,
  encoding: JsonEncoding,
  hard: boolean
): Promise<Uint8Array<ArrayBuffer>> {
  const input = Buffer.from(body)
  const output =
    encoding === "br"
      ? await brotli(input, {
          params: {
            [constants.BROTLI_PARAM_QUALITY]: hard ? 11 : 4,
            [constants.BROTLI_PARAM_SIZE_HINT]: input.length,
          },
        })
      : await gzipped(input, { level: hard ? 9 : 6 })
  return new Uint8Array(output)
}
