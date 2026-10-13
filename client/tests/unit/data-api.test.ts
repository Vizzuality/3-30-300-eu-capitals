import { describe, expect, test } from "vitest"

import {
  cacheControl,
  dataUrl,
  entityTag,
  hasPlaceholders,
  immutable,
  isNotModified,
  jsonResponse,
  matchDataRequest,
  releaseFilePath,
  type ReleaseFile,
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
    ]

    for (const [file, path] of files) {
      expect(releaseFilePath(file)).toBe(path)
      const url = dataUrl(file, RELEASE)
      expect(url.startsWith(`/api/${RELEASE}/`)).toBe(true)
      expect(matchDataRequest(url.slice("/api/".length), RELEASE)).toEqual(file)
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
