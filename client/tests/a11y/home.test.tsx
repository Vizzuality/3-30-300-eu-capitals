import { describe, expect, test } from "vitest"
import { page, userEvent } from "vitest/browser"

import { renderPage } from "./render-page"

/** The ranking's highlight, once it has faded in on its row */
async function highlightInPlace() {
  await expect
    .poll(
      () =>
        getComputedStyle(
          document.querySelector("[data-slot='ranking-highlight']") as Element
        ).opacity
    )
    .toBe("1")
}

describe("Home", () => {
  test("first view, with the ranking", async () => {
    await renderPage("/en")

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("a row of the ranking reached with the keyboard", async () => {
    await renderPage("/en")

    // From the first row to the second, as a keyboard user moves on
    page
      .getByRole("link", { name: /^Helsinki, rank 1:/ })
      .element()
      .focus()
    await userEvent.keyboard("{Tab}")
    await expect
      .element(page.getByRole("link", { name: /^Berlin, rank 2:/ }))
      .toHaveFocus()
    await highlightInPlace()

    await expect(document.body).toHaveNoA11yViolations()
  })
})
