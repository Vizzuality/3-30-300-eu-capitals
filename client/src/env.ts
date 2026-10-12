import { createEnv } from "@t3-oss/env-core"
import * as z from "zod"

export const env = createEnv({
  /*
   * Server-only variables, never sent to the browser. The bucket's endpoint,
   * name and credentials are added here with the data API.
   */
  server: {},

  /*
   * Variables available on the client and the server. Vite inlines them at
   * build time, so they must start with `VITE_`.
   */
  clientPrefix: "VITE_",
  client: {
    // The data release in use: the first segment of the data API's URLs
    VITE_DATA_RELEASE: z.string().min(1),
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
