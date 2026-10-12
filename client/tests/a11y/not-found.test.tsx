import { describe, expect, test } from "vitest"

import { renderPage } from "./render-page"

describe("404 page", () => {
  test("first view", async () => {
    await renderPage("/en/no-such-page")

    await expect(document.body).toHaveNoA11yViolations()
  })
})
