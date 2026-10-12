import { describe, expect, test } from "vitest"

import { renderPage } from "./render-page"

describe("Capital page", () => {
  test("first view", async () => {
    await renderPage("/en/capitals/stockholm")

    await expect(document.body).toHaveNoA11yViolations()
  })
})
