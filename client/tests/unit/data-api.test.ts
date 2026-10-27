import { describe, expect, test } from "vitest"

import {
  cacheControl,
  dataUrl,
  entityTag,
  hasPlaceholders,
  immutable,
  isNotModified,
  jsonResponse,
  encodedTag,
  matchDataRequest,
  matchTileRequest,
  negotiateEncoding,
  releaseFilePath,
  tileArchivePath,
  tileContentType,
  tileEncoding,
  tileResponse,
  tileUrlTemplate,
  type ReleaseFile,
  type TileArchive,
} from "@/data/api"
import {
  capitalsSchema,
  rankingSchema,
  sourcesSchema,
  summarySchema,
} from "@/data/schemas"
import capitalsFile from "@fixtures/release/capitals.json"
import rankingFile from "@fixtures/release/ranking.json"
import sourcesFile from "@fixtures/release/sources.json"
import berlinFile from "@fixtures/release/capitals/berlin/summary.json"
import stockholmFile from "@fixtures/release/capitals/stockholm/summary.json"

const RELEASE = "2026-10-stockholm"

describe("the data API's addresses", () => {
  test("the four endpoints of the release in use", () => {
    expect(matchDataRequest(`${RELEASE}/ranking`, RELEASE)).toEqual({
      kind: "ranking",
    })
    expect(matchDataRequest(`${RELEASE}/capitals`, RELEASE)).toEqual({
      kind: "capitals",
    })
    expect(matchDataRequest(`${RELEASE}/sources`, RELEASE)).toEqual({
      kind: "sources",
    })
    expect(matchDataRequest(`${RELEASE}/capitals/sofia`, RELEASE)).toEqual({
      kind: "summary",
      slug: "sofia",
    })
    expect(
      matchDataRequest(`${RELEASE}/capitals/sofia/outline`, RELEASE)
    ).toEqual({ kind: "outline", slug: "sofia" })
  })

  test("another release is refused", () => {
    expect(matchDataRequest("2026-09-stockholm/ranking", RELEASE)).toBeNull()
    expect(matchDataRequest("ranking", RELEASE)).toBeNull()
    expect(matchDataRequest(`/${RELEASE}/ranking`, RELEASE)).toBeNull()
  })

  test("only the 27 capitals", () => {
    for (const slug of ["atlantis", "Stockholm", "london", ""]) {
      expect(
        matchDataRequest(`${RELEASE}/capitals/${slug}`, RELEASE)
      ).toBeNull()
    }
    expect(
      matchDataRequest(`${RELEASE}/capitals/../ranking`, RELEASE)
    ).toBeNull()
  })

  test("no other endpoint", () => {
    for (const path of [
      RELEASE,
      `${RELEASE}/rankings`,
      `${RELEASE}/ranking.json`,
      `${RELEASE}/ranking/stockholm`,
      `${RELEASE}/capitals/stockholm/summary`,
      `${RELEASE}/capitals/stockholm/tiles/grid/8/140/74`,
      `${RELEASE}/sources/osm`,
    ]) {
      expect(matchDataRequest(path, RELEASE)).toBeNull()
    }
  })

  test("each address reads its file and the browser builds the same address", () => {
    const files: Array<[ReleaseFile, string]> = [
      [{ kind: "ranking" }, "ranking.json"],
      [{ kind: "capitals" }, "capitals.json"],
      [{ kind: "sources" }, "sources.json"],
      [{ kind: "summary", slug: "valletta" }, "capitals/valletta/summary.json"],
      [{ kind: "outline", slug: "valletta" }, "capitals/valletta/outline.json"],
    ]

    for (const [file, path] of files) {
      expect(releaseFilePath(file)).toBe(path)
      const url = dataUrl(file, RELEASE)
      expect(url.startsWith(`/api/${RELEASE}/`)).toBe(true)
      expect(matchDataRequest(url.slice("/api/".length), RELEASE)).toEqual(file)
    }
  })
})

describe("the data API's tile addresses", () => {
  test("a tile of the Home map, of a capital's grid, city map and evidence", () => {
    expect(matchTileRequest(`${RELEASE}/europe/tiles/3/4/2`, RELEASE)).toEqual({
      archive: { kind: "europe" },
      z: 3,
      x: 4,
      y: 2,
    })
    expect(
      matchTileRequest(
        `${RELEASE}/capitals/stockholm/tiles/city/14/9006/4810`,
        RELEASE
      )
    ).toEqual({
      archive: { kind: "city", slug: "stockholm" },
      z: 14,
      x: 9006,
      y: 4810,
    })
    expect(
      matchTileRequest(
        `${RELEASE}/capitals/stockholm/tiles/grid/10/562/300`,
        RELEASE
      )
    ).toEqual({
      archive: { kind: "grid", slug: "stockholm" },
      z: 10,
      x: 562,
      y: 300,
    })
    expect(
      matchTileRequest(
        `${RELEASE}/capitals/stockholm/tiles/evidence/15/18029/9639`,
        RELEASE
      )
    ).toEqual({
      archive: { kind: "evidence", slug: "stockholm" },
      z: 15,
      x: 18029,
      y: 9639,
    })
    expect(matchTileRequest(`${RELEASE}/europe/tiles/0/0/0`, RELEASE)).toEqual({
      archive: { kind: "europe" },
      z: 0,
      x: 0,
      y: 0,
    })
  })

  test("another release, capital or archive is refused", () => {
    for (const path of [
      "2026-09-stockholm/europe/tiles/3/4/2",
      `${RELEASE}/capitals/london/tiles/city/14/9006/4810`,
      `${RELEASE}/capitals/Stockholm/tiles/city/14/9006/4810`,
      `${RELEASE}/capitals/stockholm/tiles/Grid/10/562/300`,
      `${RELEASE}/capitals/stockholm/tiles/../../europe/tiles/3/4/2`,
      `${RELEASE}/world/tiles/3/4/2`,
    ]) {
      expect(matchTileRequest(path, RELEASE)).toBeNull()
    }
  })

  test("only places on the tile grid, written as whole numbers", () => {
    for (const place of [
      "3/8/2", // the column past the grid's edge
      "3/4/8",
      "23/0/0", // deeper than any archive
      "3/-1/2",
      "3/4.5/2",
      "03/4/2",
      "3/4/2.mvt",
      "3/4",
      "3/4/2/1",
      "z/x/y",
      "3/4/",
    ]) {
      expect(
        matchTileRequest(`${RELEASE}/europe/tiles/${place}`, RELEASE)
      ).toBeNull()
    }
    expect(matchTileRequest(`${RELEASE}/europe/tiles/3/7/7`, RELEASE)).not.toBe(
      null
    )
  })

  test("a JSON address is not a tile, nor a tile a JSON address", () => {
    expect(
      matchTileRequest(`${RELEASE}/capitals/stockholm`, RELEASE)
    ).toBeNull()
    expect(
      matchDataRequest(`${RELEASE}/europe/tiles/3/4/2`, RELEASE)
    ).toBeNull()
  })

  test("each archive is read from its file, and the browser asks the same address", () => {
    const archives: Array<[TileArchive, string]> = [
      [{ kind: "europe" }, "europe.pmtiles"],
      [{ kind: "grid", slug: "sofia" }, "capitals/sofia/grid.pmtiles"],
      [{ kind: "city", slug: "sofia" }, "capitals/sofia/city.pmtiles"],
      [{ kind: "context", slug: "sofia" }, "capitals/sofia/context.pmtiles"],
    ]

    for (const [archive, path] of archives) {
      expect(tileArchivePath(archive)).toBe(path)
      const url = tileUrlTemplate(archive, RELEASE)
        .replace("{z}", "5")
        .replace("{x}", "17")
        .replace("{y}", "10")
      expect(matchTileRequest(url.slice("/api/".length), RELEASE)).toEqual({
        archive,
        z: 5,
        x: 17,
        y: 10,
      })
    }
  })
})

describe("the data API's responses", () => {
  test("the entity tag is a quoted hash of the body", async () => {
    const tag = await entityTag('{"a":1}')

    expect(tag).toMatch(/^"[0-9a-f]{32}"$/)
    expect(await entityTag('{"a":1}')).toBe(tag)
    expect(await entityTag('{"a":2}')).not.toBe(tag)
  })

  test("a file is sent as JSON, with its tag and how to keep it", async () => {
    const response = jsonResponse('{"a":1}', '"tag"', null, immutable)

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("application/json")
    expect(response.headers.get("Cache-Control")).toBe(immutable)
    expect(response.headers.get("ETag")).toBe('"tag"')
    expect(await response.text()).toBe('{"a":1}')
  })

  test("a version the browser has is not sent again", async () => {
    const response = jsonResponse('{"a":1}', '"tag"', '"tag"', "no-cache")

    expect(response.status).toBe(304)
    expect(response.headers.get("ETag")).toBe('"tag"')
    expect(response.headers.get("Cache-Control")).toBe("no-cache")
    expect(await response.text()).toBe("")
  })

  test("JSON travels with the best compression the browser accepts", () => {
    expect(negotiateEncoding("gzip, deflate, br, zstd")).toBe("br")
    expect(negotiateEncoding("gzip, deflate")).toBe("gzip")
    expect(negotiateEncoding("br;q=0, gzip;q=0.5")).toBe("gzip")
    expect(negotiateEncoding("*")).toBe("br")
    expect(negotiateEncoding("*;q=0")).toBeUndefined()
    expect(negotiateEncoding("identity")).toBeUndefined()
    expect(negotiateEncoding(null)).toBeUndefined()
  })

  test("a compressed file has a tag of its own, and is not sent again", () => {
    expect(encodedTag('"abc"', "br")).toBe('"abc-br"')
    expect(encodedTag('"abc"', undefined)).toBe('"abc"')
    const body = new Uint8Array([1, 2, 3])
    const sent = jsonResponse(body, '"abc-br"', null, "no-cache", "br")
    expect(sent.headers.get("Content-Encoding")).toBe("br")
    expect(sent.headers.get("Vary")).toBe("Accept-Encoding")
    expect(
      jsonResponse(body, '"abc-br"', '"abc-br"', "no-cache", "br").status
    ).toBe(304)
  })

  test("which If-None-Match headers match", () => {
    expect(isNotModified(null, '"tag"')).toBe(false)
    expect(isNotModified('"tag"', '"tag"')).toBe(true)
    expect(isNotModified('W/"tag"', '"tag"')).toBe(true)
    expect(isNotModified('"old", "tag"', '"tag"')).toBe(true)
    expect(isNotModified("*", '"tag"')).toBe(true)
    expect(isNotModified('"old"', '"tag"')).toBe(false)
    expect(isNotModified("tag", '"tag"')).toBe(false)
    expect(isNotModified("", '"tag"')).toBe(false)
  })
})

describe("tiles, as stored", () => {
  test("each compression of the archive is the tile's encoding", () => {
    expect(tileEncoding(1)).toBeUndefined()
    expect(tileEncoding(2)).toBe("gzip")
    expect(tileEncoding(3)).toBe("br")
    expect(tileEncoding(4)).toBe("zstd")
    expect(() => tileEncoding(0)).toThrow("unknown")
  })

  test("each type of the archive is the tile's content type", () => {
    const city = { kind: "city", slug: "stockholm" } as const
    const evidence = { kind: "evidence", slug: "stockholm" } as const
    expect(tileContentType(1, city)).toBe("application/vnd.mapbox-vector-tile")
    expect(tileContentType(2, city)).toBe("image/png")
    // The evidence archive's tiles are JSON, of no standard tile type
    expect(tileContentType(0, evidence)).toBe("application/json")
    expect(() => tileContentType(0, city)).toThrow("unknown")
    expect(() => tileContentType(6, evidence)).toThrow("unknown")
  })

  test("a tile is sent as stored, still compressed, with its type and tag", async () => {
    const body = new Uint8Array([0x1f, 0x8b, 1, 2]).buffer
    const response = tileResponse({
      body,
      contentType: "application/vnd.mapbox-vector-tile",
      encoding: "gzip",
      etag: '"tag"',
      ifNoneMatch: null,
      caching: "no-cache",
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.mapbox-vector-tile"
    )
    expect(response.headers.get("Content-Encoding")).toBe("gzip")
    expect(response.headers.get("ETag")).toBe('"tag"')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array(body)
    )
  })

  test("a tile the browser has is not sent again", () => {
    const response = tileResponse({
      body: new ArrayBuffer(4),
      contentType: "application/vnd.mapbox-vector-tile",
      encoding: "gzip",
      etag: '"tag"',
      ifNoneMatch: '"tag"',
      caching: "no-cache",
    })

    expect(response.status).toBe(304)
    expect(response.headers.get("Content-Encoding")).toBeNull()
  })
})

describe("how browsers may keep a release file", () => {
  const real = { production: true, release: RELEASE, placeholder: false }

  test("for good, only from a production build serving a real release", () => {
    expect(cacheControl(real)).toBe("public, max-age=31536000, immutable")
  })

  test("checked each time in development", () => {
    expect(cacheControl({ ...real, production: false })).toBe("no-cache")
  })

  test("checked each time for the stand-in release", () => {
    expect(cacheControl({ ...real, release: "stand-in" })).toBe("no-cache")
  })

  test("checked each time for placeholder data", () => {
    expect(cacheControl({ ...real, placeholder: true })).toBe("no-cache")
  })

  test("placeholder data is found in every kind of file that can hold it", () => {
    expect(hasPlaceholders(rankingSchema.parse(rankingFile))).toBe(true)
    expect(hasPlaceholders(capitalsSchema.parse(capitalsFile))).toBe(true)
    expect(hasPlaceholders(summarySchema.parse(berlinFile))).toBe(true)

    const stockholm = summarySchema.parse(stockholmFile)
    expect(hasPlaceholders(stockholm)).toBe(false)
    expect(hasPlaceholders(sourcesSchema.parse(sourcesFile))).toBe(false)

    // The ranking of a real release
    const ranking = rankingSchema.parse(rankingFile)
    const realRanking = {
      ...ranking,
      capitals: ranking.capitals
        .filter(({ placeholder }) => !placeholder)
        .map((row) => ({ ...row, rank: 1 })),
    }
    expect(hasPlaceholders(realRanking)).toBe(false)
  })
})
