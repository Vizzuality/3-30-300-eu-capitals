import { beforeEach, inject } from "vitest"
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
