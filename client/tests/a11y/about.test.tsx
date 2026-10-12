import { describe, expect, test } from "vitest"

import { renderPage } from "./render-page"

describe("About", () => {
  test("first view", async () => {
    await renderPage("/en/about")

    await expect(document.body).toHaveNoA11yViolations()
  })
})
