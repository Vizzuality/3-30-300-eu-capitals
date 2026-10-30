import * as z from "zod"

/** How the server reaches the storage bucket that holds the releases */
export type BucketConfig = z.infer<typeof bucketConfigSchema>

const bucketConfigSchema = z.object({
  // The bucket's name for the S3 API
  name: z.string().min(1),
  // The S3 API's address, without the bucket's name
  endpoint: z.url({ protocol: /^https?$/ }),
  region: z.string().min(1),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
})

/** The server-only variables that name the bucket and its credentials */
export type BucketVariables = {
  DATA_BUCKET?: string
  DATA_BUCKET_ENDPOINT?: string
  DATA_BUCKET_REGION?: string
  DATA_BUCKET_ACCESS_KEY_ID?: string
  DATA_BUCKET_SECRET_ACCESS_KEY?: string
}

/**
 * The bucket the data API reads, or null when no bucket is set and the
 * release is read from a folder instead. A bucket is set by its name; once
 * it is, its endpoint and credentials are required too, so a half-configured
 * server fails at start rather than serving another release.
 */
export function bucketConfig(variables: BucketVariables): BucketConfig | null {
  if (variables.DATA_BUCKET === undefined) {
    return null
  }

  const result = bucketConfigSchema.safeParse({
    name: variables.DATA_BUCKET,
    endpoint: variables.DATA_BUCKET_ENDPOINT,
    region: variables.DATA_BUCKET_REGION,
    accessKeyId: variables.DATA_BUCKET_ACCESS_KEY_ID,
    secretAccessKey: variables.DATA_BUCKET_SECRET_ACCESS_KEY,
  })
  if (!result.success) {
    // Names the variables only, never their values
    const fields = result.error.issues.map((issue) => issue.path.join("."))
    throw new Error(
      `DATA_BUCKET is set, but these bucket settings are missing or invalid: ${fields.join(", ")}`
    )
  }
  return result.data
}
