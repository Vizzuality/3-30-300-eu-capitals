import { describe, expect, test } from "vitest"

import { renderPage } from "./render-page"

describe("Methodology", () => {
  test("first view", async () => {
    await renderPage("/en/methodology")

    await expect(document.body).toHaveNoA11yViolations()
  })
})
