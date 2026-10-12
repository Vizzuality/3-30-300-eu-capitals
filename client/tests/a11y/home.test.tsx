import { describe, expect, test } from "vitest"

import { Route } from "@/routes/index"
import { renderPage } from "./render-page"

describe("Home", () => {
  test("first view", async () => {
    await renderPage(Route, "/")

    await expect(document.body).toHaveNoA11yViolations()
  })
})
