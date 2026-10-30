import {
  GetObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3"

import type { BucketConfig } from "./bucket-config"
import { rangeHeader, type BucketObjects } from "./bucket-release-files.server"

/** How a read is sent to the bucket: the S3 client's `send` */
export type SendGetObject = (
  command: GetObjectCommand
) => Promise<GetObjectCommandOutput>

/**
 * One client for the process, on the bucket's S3 API. Railway's buckets are
 * virtual-hosted (the bucket's name is the first label of the endpoint's
 * host), so path-style URLs stay off. A read is tried 4 times in all, on the
 * errors the SDK counts as passing (throttling, 5xx, the network).
 */
function sendOf(config: BucketConfig): SendGetObject {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: false,
    maxAttempts: 4,
  })
  return (command) => client.send(command)
}

/** The parts of an S3 error that tell what went wrong */
type S3Error = { name?: string; $metadata?: { httpStatusCode?: number } }

/**
 * The bucket's objects, read with `GetObject`. A missing object is null; a
 * range that starts past its end has no bytes, as when reading a file; any
 * other answer, a missing bucket included, is an error, which names the
 * object and the status, never the credentials or the request.
 */
export function s3BucketObjects(
  config: BucketConfig,
  send: SendGetObject = sendOf(config)
): BucketObjects {
  return {
    async get(key, range) {
      let response
      try {
        response = await send(
          new GetObjectCommand({
            Bucket: config.name,
            Key: key,
            Range: range ? rangeHeader(range) : undefined,
          })
        )
      } catch (error) {
        const { name, $metadata } = error as S3Error
        const status = $metadata?.httpStatusCode
        if (name === "NoSuchKey") {
          return null
        }
        if (name === "InvalidRange" || status === 416) {
          return new ArrayBuffer(0)
        }
        // Without the SDK's error as its cause, which carries the request
        // and the response
        // oxlint-disable-next-line preserve-caught-error
        throw new Error(`The bucket answered ${status ?? "nothing"} for ${key}`)
      }

      const bytes = await response.Body?.transformToByteArray()
      if (!bytes) {
        return new ArrayBuffer(0)
      }
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer
    },
  }
}
