import { describe, expect, test } from "vitest"
import { page, userEvent } from "vitest/browser"

import { renderPage } from "./render-page"

describe("Capital page", () => {
  test("first view, with the header and Other capitals", async () => {
    await renderPage("/en/capitals/stockholm")

    await expect(document.body).toHaveNoA11yViolations()
  })

  // Their own row is the first or the last of Other capitals
  test.each([
    ["the first capital", "helsinki"],
    ["the last capital", "valletta"],
  ])("first view of %s", async (_, slug) => {
    await renderPage(`/en/capitals/${slug}`)

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("a row of Other capitals reached with the keyboard", async () => {
    await renderPage("/en/capitals/stockholm")

    // From "All 27" to the first row, as a keyboard user moves on
    page
      .getByRole("link", { name: "All 27 capitals, in the ranking" })
      .element()
      .focus()
    await userEvent.keyboard("{Tab}")
    await expect
      .element(page.getByRole("link", { name: /^Paris, rank 16:/ }))
      .toHaveFocus()
    // The highlight, once it has moved to the row
    const row = page.getByRole("link", { name: /^Paris, rank 16:/ }).element()
    await expect
      .poll(() => {
        const highlight = document.querySelector(
          "[data-slot='row-highlight']"
        ) as HTMLElement
        return (
          getComputedStyle(highlight).opacity === "1" &&
          highlight.getBoundingClientRect().top ===
            row.getBoundingClientRect().top
        )
      })
      .toBe(true)

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("another capital opened from Other capitals", async () => {
    await renderPage("/en/capitals/stockholm")

    page
      .getByRole("link", { name: /^Paris, rank 16:/ })
      .element()
      .focus()
    await userEvent.keyboard("{Enter}")
    await expect
      .element(page.getByRole("heading", { level: 1, name: "Paris" }))
      .toBeInTheDocument()
    // Once the leaving page has faded out and the new one has faded in
    await expect.poll(() => document.querySelector("main [inert]")).toBeNull()
    await expect
      .poll(() =>
        [...document.querySelectorAll("main > div > div > *")].every(
          (part) => getComputedStyle(part).opacity === "1"
        )
      )
      .toBe(true)

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
