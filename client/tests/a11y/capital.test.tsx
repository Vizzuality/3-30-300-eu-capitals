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

  // Each state of the middle block and the Next step guide that an address
  // can reach: the street from the area in view, then a building of the
  // stand-in release, with each rule and one of its facades
  test.each([
    ["the street", "?at=18.06,59.312,18.08,59.318"],
    ["a building selected, rule 3", "?building=31947"],
    ["a facade selected", "?building=31947&rule=3&facade=102293"],
    ["rule 30", "?building=31947&rule=30"],
    ["rule 300", "?building=31947&rule=300"],
    ["rule 300, the nearest park without a name", "?building=2677&rule=300"],
    ["rule 300, no path to a park", "?building=64634&rule=300"],
  ])("middle block and guide: %s", async (_, search) => {
    await renderPage(`/en/capitals/stockholm${search}`)
    await expect
      .element(
        page
          .getByRole("main")
          .getByText(/Selected building|building takes|Every 10 m square/)
      )
      .toBeInTheDocument()

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("the rule switcher reached and operated with the keyboard", async () => {
    await renderPage("/en/capitals/stockholm?building=31947")

    // From the close button, as a keyboard user moves on
    page.getByRole("button", { name: "Close the building" }).element().focus()
    await userEvent.keyboard("{Tab}")
    await expect
      .element(page.getByRole("radio", { name: "3 trees met" }))
      .toHaveFocus()
    await userEvent.keyboard("{ArrowRight}")
    await expect
      .element(page.getByRole("radio", { name: "30 % canopy not met" }))
      .toBeChecked()
    await expectSwapped("20% tree canopy")

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("the building closed with Escape", async () => {
    await renderPage("/en/capitals/stockholm?building=31947&rule=300")

    page
      .getByRole("radio", { name: "300 m to a park not met" })
      .element()
      .focus()
    await userEvent.keyboard("{Escape}")
    await expectSwapped("Residents meeting each rule")

    await expect(document.body).toHaveNoA11yViolations()
  })
})

/** The middle block shows `text`, the content it replaced having faded out */
async function expectSwapped(text: string) {
  await expect.element(page.getByText(text)).toBeInTheDocument()
  await expect.poll(() => document.querySelector("main [inert]")).toBeNull()
  await expect
    .poll(() =>
      [...document.querySelectorAll("main [data-slot='swap-part']")].every(
        (part) => getComputedStyle(part).opacity === "1"
      )
    )
    .toBe(true)
}
