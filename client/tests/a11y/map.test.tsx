import { describe, expect, test } from "vitest"
import { page, userEvent } from "vitest/browser"

import { renderPage } from "./render-page"

/*
 * The map's one focus stop, its key hint and its live region, with the
 * overlays in place, on Home and on a capital. The map is drawn by its
 * stand-in (no WebGL), with the same focus stop, keys and overlays.
 */

const map = () => page.getByRole("application")

/** Moves to the map with Tab, from the element before it in the page */
async function tabToMap() {
  const tabbable = [
    ...document.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), input, [tabindex='0']"
    ),
  ].filter(
    (element) =>
      element.offsetParent !== null || element.matches("[role='application']")
  )
  const index = tabbable.indexOf(map().element() as HTMLElement)
  tabbable[index - 1].focus()
  await userEvent.keyboard("{Tab}")
  await expect.element(map()).toHaveFocus()
}

describe("The map", () => {
  test("Home: the map reached with the keyboard, with its key hint", async () => {
    await renderPage("/en")

    await tabToMap()
    await expect.element(map()).toHaveAccessibleName("Map of Europe")
    await expect.element(page.getByText(/next capital/)).toBeVisible()

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("Home: a capital reached with Tab, its label shown, announced and its row highlighted", async () => {
    await renderPage("/en")

    await tabToMap()
    await userEvent.keyboard("{Tab}{Tab}")
    await expect.element(map()).toHaveFocus()
    // The second capital of the ranking
    await expect
      .poll(
        () => document.querySelector("[data-map] output.sr-only")?.textContent
      )
      .toMatch(/^Berlin, Germany, rank 2 of 27: /)
    await expect
      .poll(() => document.querySelector("[data-hover-label]")?.textContent)
      .toContain("Berlin")
    // Its ranking row highlighted, once the highlight has faded in on it
    await expect
      .poll(() => {
        const row = document.querySelector<HTMLElement>("[data-slug='berlin']")
        const highlight = row
          ?.closest("ol")
          ?.parentElement?.querySelector<HTMLElement>(
            "[data-slot='row-highlight']"
          )
        return (
          row !== null &&
          highlight !== null &&
          highlight !== undefined &&
          getComputedStyle(highlight).opacity === "1" &&
          Math.abs(
            highlight.getBoundingClientRect().top -
              row.getBoundingClientRect().top
          ) < 1
        )
      })
      .toBe(true)

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("a capital: the city overview reached with the keyboard, with its centre marked", async () => {
    await renderPage("/en/capitals/stockholm")

    await tabToMap()
    await expect
      .element(map())
      .toHaveAccessibleName("Map of Stockholm, city overview")
    await expect
      .poll(() => document.querySelector("[data-centre-mark]"))
      .not.toBeNull()
    await expect.poll(() => document.getAnimations().length).toBe(0)

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("a capital: the map zoomed in to the street with Enter, as it is announced", async () => {
    await renderPage("/en/capitals/stockholm")

    await tabToMap()
    await userEvent.keyboard("{Enter}")
    await expect
      .poll(
        () => document.querySelector("[data-map] output.sr-only")?.textContent
      )
      .toBe("Street level")
    await expect
      .element(map())
      .toHaveAccessibleName("Map of Stockholm, street level")
    // Once the middle block has faded to the street's sentence
    await expect.poll(() => document.getAnimations().length).toBe(0)

    await expect(document.body).toHaveNoA11yViolations()
  })
})
