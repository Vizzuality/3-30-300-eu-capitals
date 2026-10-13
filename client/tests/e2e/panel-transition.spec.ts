import { expect, test, type Page } from "@playwright/test"

/*
 * Moving to another page changes only the panel's content. Keyboard and
 * screen reader users are then where a full page load would put them: focus
 * is back at the start of the page and the new page's name is announced.
 * A change of language alone keeps focus where it is. The map area is never
 * remounted.
 */

async function mapAreaInstance(page: Page) {
  const mapArea = page.locator("[data-map-area]")
  // Also waits for the page to be hydrated
  await expect(mapArea).toHaveAttribute("data-instance", /.+/)
  return (await mapArea.getAttribute("data-instance")) as string
}

// The page's announcer, outside the page's content (the Next step guide has
// its own live region, inside it)
const announcer = (page: Page) =>
  page.locator("[aria-live='polite']:not(main *)")

/** Focus is at the start of the page: the next Tab reaches the skip link */
async function expectFocusAtStart(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.activeElement === document.body))
    .toBe(true)
  await page.keyboard.press("Tab")
  await expect(
    page.getByRole("link", { name: "Skip to content" })
  ).toBeFocused()
}

test("a page opened from the top bar with the keyboard starts from the top", async ({
  page,
}) => {
  await page.goto("/en")
  const instance = await mapAreaInstance(page)
  // Nothing is announced when the site loads
  await expect(announcer(page)).toHaveText("")

  await page
    .getByRole("navigation", { name: "Site" })
    .getByRole("link", { name: "About" })
    .focus()
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL("/en/about")
  await expect(announcer(page)).toHaveText("About this site · 3-30-300")
  await expectFocusAtStart(page)

  await expect(page.locator("[data-map-area]")).toHaveAttribute(
    "data-instance",
    instance
  )
})

test("a link in the page's content leads to the top of the new page", async ({
  page,
}) => {
  await page.goto("/en/capitals/atlantis")
  const instance = await mapAreaInstance(page)

  await page.getByRole("link", { name: "Go to the home page" }).focus()
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL("/en")
  await expect(announcer(page)).toHaveText(
    "How green is your capital? The 3-30-300 rule in the 27 EU capitals"
  )
  await expectFocusAtStart(page)

  await expect(page.locator("[data-map-area]")).toHaveAttribute(
    "data-instance",
    instance
  )
})

test("changing only the language keeps focus where it is", async ({ page }) => {
  await page.goto("/en/about")
  const instance = await mapAreaInstance(page)
  const about = page
    .getByRole("navigation", { name: "Site" })
    .getByRole("link", { name: "About" })
  await about.focus()

  // The language list comes later: the address changes through the History
  // API, which the router follows as it will for the list
  await page.evaluate(() => window.history.pushState({}, "", "/fr/about"))
  await expect(page.locator("html")).toHaveAttribute("lang", "fr")
  // Once the new content is in place
  await expect(page.locator("main [inert]")).toHaveCount(0)

  await expect(about).toBeFocused()
  await expect(announcer(page)).toHaveText("")
  await expect(page.locator("[data-map-area]")).toHaveAttribute(
    "data-instance",
    instance
  )
})
