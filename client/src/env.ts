import { createEnv } from "@t3-oss/env-core"
import * as z from "zod"

import { releaseNameSchema, standInRelease } from "./data/schemas"

export const env = createEnv({
  /*
   * Server-only variables, never sent to the browser. The bucket's endpoint,
   * name and credentials come with the deployment.
   */
  server: {
    // The folder of the release the data API reads, relative to the client
    // folder or absolute. By default, the stand-in release kept with the
    // tests (development and test data); a release written by the pipeline
    // can be used instead.
    DATA_RELEASE_DIR: z.string().min(1).default("tests/fixtures/release"),

    // The storage bucket that holds the releases, read instead of
    // `DATA_RELEASE_DIR` once `DATA_BUCKET` is set: its name for the S3 API,
    // the API's endpoint, region and credentials, all provided by the
    // deployment (`bucketConfig` checks they come together)
    DATA_BUCKET: z.string().min(1).optional(),
    DATA_BUCKET_ENDPOINT: z.url().optional(),
    DATA_BUCKET_REGION: z.string().min(1).default("auto"),
    DATA_BUCKET_ACCESS_KEY_ID: z.string().min(1).optional(),
    DATA_BUCKET_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  },

  /*
   * Variables available on the client and the server. Vite inlines them at
   * build time, so they must start with `VITE_`.
   */
  clientPrefix: "VITE_",
  client: {
    // The data release in use: the first segment of the data API's URLs.
    // It must match the `release` of the files in `DATA_RELEASE_DIR`.
    VITE_DATA_RELEASE: releaseNameSchema.default(standInRelease),
  },

  /*
   * Vite exposes the `VITE_` variables through `import.meta.env`. The server
   * also reads its own variables from `process.env`, which the browser doesn't
   * have.
   */
  runtimeEnv: {
    ...(typeof process === "undefined" ? {} : process.env),
    ...import.meta.env,
  },
  emptyStringAsUndefined: true,
})
