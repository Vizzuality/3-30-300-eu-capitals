import { describe, expect, test } from "vitest"
import { page, userEvent } from "vitest/browser"

import { renderPage } from "./render-page"

/** The ranking's highlight, once it has faded in on its row */
async function highlightInPlace() {
  await expect
    .poll(
      () =>
        getComputedStyle(
          document.querySelector("[data-slot='row-highlight']") as Element
        ).opacity
    )
    .toBe("1")
}

/** The A–Z tab, opened from the Ranking tab with the keyboard */
async function openAzList() {
  page.getByRole("tab", { name: "Ranking" }).element().focus()
  await userEvent.keyboard("{ArrowRight}{Enter}")
  await expect
    .element(page.getByRole("tab", { name: "A–Z list" }))
    .toHaveAttribute("aria-selected", "true")
  // Its content, once it has faded in
  await expect
    .poll(() =>
      [...document.querySelectorAll("[data-slot='tab-content']")].map(
        (content) => getComputedStyle(content).opacity
      )
    )
    .toEqual(["1"])
}

/** A search typed in the A–Z list, reached with Tab from its tab */
async function search(text: string) {
  await openAzList()
  const field = page.getByRole("searchbox", {
    name: "Find a capital or a country",
  })
  for (let presses = 0; presses < 3; presses++) {
    if (document.activeElement === field.element()) {
      break
    }
    await userEvent.keyboard("{Tab}")
  }
  await expect.element(field).toHaveFocus()
  await userEvent.keyboard(text)
}

/** Whether an element is in a live region, a copy read to screen readers */
const inLiveRegion = (element: Element) => !!element.closest("[aria-live]")

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

  test("the Ranking tab reached with the keyboard", async () => {
    await renderPage("/en")

    page.getByRole("tab", { name: "Ranking" }).element().focus()
    await expect
      .element(page.getByRole("tab", { name: "Ranking" }))
      .toHaveFocus()

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("the A–Z tab opened with the keyboard", async () => {
    await renderPage("/en")

    await openAzList()
    await expect
      .element(page.getByRole("link", { name: "Amsterdam, Netherlands" }))
      .toBeVisible()

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("a search with results", async () => {
    await renderPage("/en")

    await search("Kobenhavn")
    await expect
      .element(page.getByRole("link", { name: "Copenhagen, Denmark" }))
      .toBeVisible()

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("a search with no match", async () => {
    await renderPage("/en")

    await search("qx")
    const noMatch = "No capital or country matches “qx”"
    // The message under the search field, and its visually hidden copy in
    // the live region, which screen readers get once typing has paused
    const copies = () => page.getByText(noMatch).elements()
    await expect
      .poll(() => copies().some((element) => !inLiveRegion(element)))
      .toBe(true)
    await expect
      .element(
        page.elementLocator(
          copies().find((element) => !inLiveRegion(element)) as Element
        )
      )
      .toBeVisible()
    await expect.poll(() => copies().some(inLiveRegion)).toBe(true)

    await expect(document.body).toHaveNoA11yViolations()
  })
})
