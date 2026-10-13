import { describe, expect, test } from "vitest"

import { renderPage } from "./render-page"

describe("Capital page", () => {
  test("first view", async () => {
    await renderPage("/en/capitals/stockholm")

    await expect(document.body).toHaveNoA11yViolations()
  })

  // Each state of the Next step guide that an address can reach (the street
  // needs the map, and is checked on the kit page)
  test.each([
    ["a building selected, rule 3", "?building=12"],
    ["a facade selected", "?building=12&rule=3&facade=40"],
    ["rule 30", "?building=12&rule=30"],
    ["rule 300", "?building=12&rule=300"],
  ])("next step guide: %s", async (_, search) => {
    await renderPage(`/en/capitals/stockholm${search}`)

    await expect(document.body).toHaveNoA11yViolations()
  })
})
