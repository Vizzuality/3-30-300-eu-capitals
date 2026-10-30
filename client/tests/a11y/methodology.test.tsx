import { describe, expect, test } from "vitest"
import { page, userEvent } from "vitest/browser"

import { renderPage } from "./render-page"

const sections = [
  "3 trees in view",
  "30% canopy around",
  "300 m to a park",
  "Residents",
  "City limits",
  "Data",
  "Limits",
]

describe("Methodology", () => {
  test("first view", async () => {
    await renderPage("/en/methodology")
    await expect
      .element(page.getByRole("table", { name: /data sources/ }))
      .toBeInTheDocument()
    await expect
      .element(page.getByRole("link", { name: "Back to the map" }))
      .toBeInTheDocument()

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("the back link reached with the keyboard", async () => {
    await renderPage("/en/methodology")

    // From the top bar's last link, as a keyboard user moves on
    page
      .getByRole("navigation", { name: "Site" })
      .getByRole("link", { name: "About" })
      .element()
      .focus()
    await userEvent.keyboard("{Tab}")
    await expect
      .element(page.getByRole("link", { name: "Back to the map" }))
      .toHaveFocus()

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("each link of the table of contents", async () => {
    await renderPage("/en/methodology")
    const contents = page.getByRole("navigation", { name: "On this page" })

    for (const name of sections) {
      contents.getByRole("link", { name, exact: true }).element().focus()
      await userEvent.keyboard("{Enter}")
      // Once focus is on the section
      await expect
        .poll(() => document.activeElement?.querySelector("h2")?.textContent)
        .toBe(name)

      await expect(document.body).toHaveNoA11yViolations()
    }
  })
})
