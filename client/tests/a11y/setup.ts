import { beforeEach, inject, vi } from "vitest"
import { page } from "vitest/browser"

declare module "vitest" {
  interface ProvidedContext {
    setup: string
  }
}

// A failing test leaves a screenshot of the page in
// `tests/a11y/__screenshots__/<setup>/<test file>/<test>.png`
beforeEach(({ task, onTestFailed }) => {
  onTestFailed(async () => {
    const file = task.file.name.split("/").at(-1)
    const name = task.fullTestName.replace(/\W/g, "-")

    await page.screenshot({
      path: `__screenshots__/${inject("setup")}/${file}/${name}.png`,
    })
  })
})

/*
 * The pages run here as in the browser, without TanStack Start's build step,
 * which keeps only the browser's side of each isomorphic function and leaves
 * the server's modules out. The pages read the stand-in release from the
 * query cache (see `stand-in-release.ts`), so the server's file reader is
 * never called.
 */
vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => {
    const fn = { server: () => fn, client: (client: unknown) => client }
    return fn
  },
}))
vi.mock("@/data/release.server", () => ({
  readReleaseFile: () => {
    throw new Error("The tests read the release from the query cache")
  },
}))
