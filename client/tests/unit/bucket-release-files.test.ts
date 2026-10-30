import type {
  GetObjectCommand,
  GetObjectCommandOutput,
} from "@aws-sdk/client-s3"
import { describe, expect, test } from "vitest"

import { bucketConfig } from "@/data/bucket-config"
import {
  bucketReleaseFiles,
  rangeHeader,
  type BucketObjects,
  type ByteRange,
} from "@/data/bucket-release-files.server"
import { s3BucketObjects } from "@/data/s3-bucket-objects.server"

const RELEASE = "2026-10-all"

/** A bucket in memory, which records what it is asked */
function memoryBucket(objects: Record<string, string>) {
  const reads: { key: string; range?: ByteRange }[] = []
  const bucket: BucketObjects = {
    async get(key, range) {
      reads.push({ key, range })
      const text = objects[key]
      if (text === undefined) {
        return null
      }
      const bytes = new TextEncoder().encode(text)
      const part = range
        ? bytes.slice(range.offset, range.offset + range.length)
        : bytes
      return part.buffer
    },
  }
  return { bucket, reads }
}

describe("a release in the bucket", () => {
  test("its files are read under releases/<release>/", async () => {
    const { bucket, reads } = memoryBucket({
      "releases/2026-10-all/ranking.json": '{"release":"2026-10-all"}',
    })
    const files = bucketReleaseFiles(bucket, RELEASE)

    expect(await files.readText("ranking.json")).toBe(
      '{"release":"2026-10-all"}'
    )
    expect(reads).toEqual([
      { key: "releases/2026-10-all/ranking.json", range: undefined },
    ])
  })

  test("another release's files are never read", async () => {
    const { bucket } = memoryBucket({
      "releases/2026-10-stockholm/ranking.json": "{}",
    })

    expect(
      await bucketReleaseFiles(bucket, RELEASE).readText("ranking.json")
    ).toBeNull()
  })

  test("an archive is read by byte ranges", async () => {
    const { bucket, reads } = memoryBucket({
      "releases/2026-10-all/capitals/stockholm/city.pmtiles": "0123456789",
    })
    const files = bucketReleaseFiles(bucket, RELEASE)
    const path = "capitals/stockholm/city.pmtiles"

    const bytes = await files.readBytes(path, 2, 3)
    expect(new TextDecoder().decode(bytes ?? undefined)).toBe("234")
    expect(reads[0]).toEqual({
      key: `releases/2026-10-all/${path}`,
      range: { offset: 2, length: 3 },
    })
    expect(await files.readBytes("capitals/rome/city.pmtiles", 0, 3)).toBeNull()
  })

  test("a range is written with both ends included", () => {
    expect(rangeHeader({ offset: 0, length: 16_384 })).toBe("bytes=0-16383")
    expect(rangeHeader({ offset: 127, length: 1 })).toBe("bytes=127-127")
  })
})

/** An S3 error as the client throws it: its name and HTTP status */
const s3Error = (name: string, httpStatusCode: number) =>
  Object.assign(new Error(name), { name, $metadata: { httpStatusCode } })

describe("the bucket's S3 API", () => {
  const config = {
    name: "releases-abc123",
    endpoint: "https://t3.storageapi.dev",
    region: "auto",
    accessKeyId: "key-id",
    secretAccessKey: "secret-key",
  }

  /** A client's `send` that answers once, and records what it was asked */
  function answering(answer: { body: string } | Error) {
    const commands: GetObjectCommand[] = []
    const send = async (command: GetObjectCommand) => {
      commands.push(command)
      if (answer instanceof Error) {
        throw answer
      }
      const bytes = new TextEncoder().encode(answer.body)
      return {
        $metadata: {},
        Body: { transformToByteArray: async () => bytes },
      } as unknown as GetObjectCommandOutput
    }
    return { objects: s3BucketObjects(config, send), commands }
  }

  test("a range is asked with its Range, in the configured bucket", async () => {
    const { objects, commands } = answering({ body: "abc" })

    const bytes = await objects.get("releases/r/city.pmtiles", {
      offset: 16_384,
      length: 3,
    })
    expect(new TextDecoder().decode(bytes ?? undefined)).toBe("abc")
    expect(commands[0].input).toEqual({
      Bucket: "releases-abc123",
      Key: "releases/r/city.pmtiles",
      Range: "bytes=16384-16386",
    })
  })

  test("a whole object is asked without a range", async () => {
    const { objects, commands } = answering({ body: "{}" })

    expect(await objects.get("releases/r/ranking.json")).not.toBeNull()
    expect(commands[0].input.Range).toBeUndefined()
  })

  test("a missing key is a missing file", async () => {
    const { objects } = answering(s3Error("NoSuchKey", 404))

    expect(
      await objects.get("releases/r/capitals/rome/city.pmtiles")
    ).toBeNull()
  })

  test("a range past the end has no bytes", async () => {
    const { objects } = answering(s3Error("InvalidRange", 416))

    const bytes = await objects.get("releases/r/city.pmtiles", {
      offset: 10,
      length: 5,
    })
    expect(bytes?.byteLength).toBe(0)
  })

  test("a missing bucket or any other answer is an error, without the credentials", async () => {
    for (const [error, status] of [
      [s3Error("NoSuchBucket", 404), 404],
      [s3Error("AccessDenied", 403), 403],
      [s3Error("InternalError", 500), 500],
    ] as const) {
      const { objects } = answering(error)
      const thrown = await objects.get("releases/r/ranking.json").then(
        () => null,
        (reason: unknown) => reason as Error
      )

      expect(thrown?.message).toBe(
        `The bucket answered ${status} for releases/r/ranking.json`
      )
      expect(thrown?.message).not.toContain("secret-key")
      expect(thrown?.message).not.toContain("key-id")
    }
  })
})

describe("the bucket's settings", () => {
  const complete = {
    DATA_BUCKET: "releases-abc123",
    DATA_BUCKET_ENDPOINT: "https://t3.storageapi.dev",
    DATA_BUCKET_REGION: "auto",
    DATA_BUCKET_ACCESS_KEY_ID: "key-id",
    DATA_BUCKET_SECRET_ACCESS_KEY: "secret-key",
  }

  test("no bucket name, no bucket: the release is read from a folder", () => {
    expect(bucketConfig({})).toBeNull()
    expect(bucketConfig({ ...complete, DATA_BUCKET: undefined })).toBeNull()
  })

  test("a bucket name with its endpoint and credentials", () => {
    expect(bucketConfig(complete)).toEqual({
      name: "releases-abc123",
      endpoint: "https://t3.storageapi.dev",
      region: "auto",
      accessKeyId: "key-id",
      secretAccessKey: "secret-key",
    })
  })

  test("a bucket name without the rest stops the server, naming what is missing but no value", () => {
    const variables = {
      ...complete,
      DATA_BUCKET_ENDPOINT: "not a url",
      DATA_BUCKET_SECRET_ACCESS_KEY: undefined,
    }

    expect(() => bucketConfig(variables)).toThrow("endpoint, secretAccessKey")
    expect(() => bucketConfig(variables)).not.toThrow("not a url")
  })
})
