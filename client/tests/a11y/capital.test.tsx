import { describe, expect, test } from "vitest"
import { page, userEvent } from "vitest/browser"

import { renderPage } from "./render-page"

// The area around building 31947 (rule 3 met, the others not), where its
// address finds it
const southern = "building=31947&at=18.0813,59.3101,18.0866,59.3127"

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
  // can reach: the street from the area in view, then a building read from
  // the stand-in's tiles, with each rule and one of its facades
  test.each([
    ["the street", "?at=18.06,59.312,18.08,59.318"],
    ["a building selected, rule 3", `?${southern}`],
    ["a facade selected", `?${southern}&rule=3&facade=102293`],
    ["rule 30", `?${southern}&rule=30`],
    ["rule 300", `?${southern}&rule=300`],
    [
      "rule 300, next to a park",
      "?building=37890&at=18.0865,59.3125,18.0915,59.3147&rule=300",
    ],
    [
      "rule 300, no path to a park",
      "?building=50404&at=18.0645,59.3125,18.0695,59.3147&rule=300",
    ],
  ])("middle block and guide: %s", async (_, search) => {
    await renderPage(`/en/capitals/stockholm${search}`)
    await expect
      .element(
        page
          .getByRole("main")
          .getByText(/Selected building ·|building takes|Every 10 m square/)
      )
      .toBeInTheDocument()
    await legendShown()

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("the rule switcher reached and operated with the keyboard", async () => {
    await renderPage(`/en/capitals/stockholm?${southern}`)
    // Once the building is read from the tiles
    const close = page.getByRole("button", { name: "Close the building" })
    await expect.element(close).toBeInTheDocument()

    // From the close button, as a keyboard user moves on
    close.element().focus()
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

  test("a building's facades reached with the keyboard on the map", async () => {
    await renderPage(`/en/capitals/stockholm?${southern}`)
    await expect
      .element(page.getByRole("button", { name: "Close the building" }))
      .toBeInTheDocument()
    await legendShown("Facades that see 3 trees or more")

    page.getByRole("application").element().focus()
    await userEvent.keyboard("{Tab}")
    await expect.element(page.getByRole("application")).toHaveFocus()
    await expect
      .poll(
        () => document.querySelector("[data-map] output.sr-only")?.textContent
      )
      .toMatch(/^Facade 1 of 17: .+, (met|not met)$/)
    // Once the key hint has floated in
    await expect
      .poll(() => {
        const hint = document.querySelector("[data-key-hint]")
        return hint && getComputedStyle(hint).opacity
      })
      .toBe("1")

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("the building closed with Escape", async () => {
    await renderPage(`/en/capitals/stockholm?${southern}&rule=300`)
    // Once the building is read from the tiles
    const chip = page.getByRole("radio", { name: "300 m to a park not met" })
    await expect.element(chip).toBeInTheDocument()

    chip.element().focus()
    await userEvent.keyboard("{Escape}")
    await expectSwapped(/^Each building takes the colour/)

    await expect(document.body).toHaveNoA11yViolations()
  })
})

/**
 * The legend has faded in to the view's entries: every legend shown is
 * opaque, and holds `entry` when given (the old entries may still be fully
 * shown, before they start to fade out)
 */
async function legendShown(entry?: string) {
  await expect
    .poll(() => {
      const lists = [...document.querySelectorAll("ul[aria-label='Legend']")]
      return lists.every(
        (list) =>
          getComputedStyle(list).opacity === "1" &&
          (entry === undefined || list.textContent?.includes(entry))
      )
    })
    .toBe(true)
}

/** The middle block shows `text`, the content it replaced having faded out */
async function expectSwapped(text: string | RegExp) {
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
