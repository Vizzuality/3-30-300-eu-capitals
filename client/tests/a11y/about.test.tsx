import { describe, expect, test } from "vitest"
import { page, userEvent } from "vitest/browser"

import { renderPage } from "./render-page"

/** Once the leaving page has faded out and the new one has faded in */
async function pageArrived(heading: string) {
  await expect
    .element(page.getByRole("heading", { level: 1, name: heading }))
    .toBeInTheDocument()
  await expect.poll(() => document.querySelector("main [inert]")).toBeNull()
  await expect
    .poll(() =>
      [...document.querySelectorAll("main > div > div > *")].every(
        (part) => getComputedStyle(part).opacity === "1"
      )
    )
    .toBe(true)
}

/** About, opened with the keyboard from the top bar */
async function openAbout() {
  page
    .getByRole("navigation", { name: "Site" })
    .getByRole("link", { name: "About" })
    .element()
    .focus()
  await userEvent.keyboard("{Enter}")
  await pageArrived("About this site")
}

describe("About", () => {
  test("first view, opened directly", async () => {
    await renderPage("/en/about")
    await expect
      .element(page.getByRole("link", { name: "Back to the map" }))
      .toBeInTheDocument()

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("opened from a capital page", async () => {
    await renderPage("/en/capitals/stockholm?building=31947&rule=30")
    await openAbout()
    await expect
      .element(page.getByRole("link", { name: "Back to the map" }))
      .toHaveAttribute("href", "/en/capitals/stockholm?building=31947&rule=30")

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("opened from Methodology", async () => {
    await renderPage("/en/methodology")
    await openAbout()
    await expect
      .element(page.getByRole("link", { name: "Back to Methodology" }))
      .toBeInTheDocument()

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("the back link reached with the keyboard", async () => {
    await renderPage("/en/about")

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

  test("the footer's link reached with the keyboard", async () => {
    await renderPage("/en/about")

    page.getByRole("link", { name: "Vizzuality" }).first().element().focus()
    await userEvent.keyboard("{Tab}")
    await expect
      .element(
        page.getByRole("contentinfo").getByRole("link", { name: "Vizzuality" })
      )
      .toHaveFocus()

    await expect(document.body).toHaveNoA11yViolations()
  })
})
