import { describe, expect, test } from "vitest"

import { renderPage } from "./render-page"

describe("Home", () => {
  test("first view", async () => {
    await renderPage("/en")

    await expect(document.body).toHaveNoA11yViolations()
  })
})
