import { expect, test, type Page } from "@playwright/test"

import { hydrated } from "./page-ready"
import { slowAnimations } from "./slow-animations"

/*
 * Moving to another page changes only the panel's content. Keyboard and
 * screen reader users are then where a full page load would put them: focus
 * is back at the start of the page and the new page's name is announced.
 * A change of language alone keeps focus where it is. The map area is never
 * remounted.
 */

async function mapAreaInstance(page: Page) {
  const mapArea = page.locator("[data-map-area]")
  // Also waits for the page to be hydrated, and its map set up
  await hydrated(page)
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
  await expect(announcer(page)).toHaveText(
    "About this site: the research and open data behind it · 3-30-300"
  )
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

/*
 * Leaving a page and coming straight back, or going on again, while the
 * leaving content still fades out: the page is shown once, in full, and its
 * name is announced once. The fades play ten times slower, so the second
 * move always lands during the first fade.
 */

async function openStockholm(page: Page, isMobile: boolean) {
  const row = page.getByRole("link", { name: /^Stockholm, rank 17:/ })
  await row.scrollIntoViewIfNeeded()
  if (isMobile) {
    await row.tap()
  } else {
    await row.click()
  }
  await expect(page).toHaveURL("/en/capitals/stockholm")
}

/**
 * The page has changed: the new page is in place and the content left
 * behind is fading out. The address changes before the new page is rendered,
 * and a move made before that only cancels the first.
 */
async function fadingTo(page: Page, heading: string) {
  await expect(page.locator("main [inert]").first()).toBeAttached()
  await expect(
    page.locator("main h1:not([inert] *)", { hasText: heading })
  ).toBeAttached()
}

/**
 * Every leaving copy has gone, and the page's parts (each part of the panel,
 * and what floats in within it) are shown in full
 */
async function settled(page: Page) {
  await expect(page.locator("main [inert]")).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(() =>
        [
          ...document.querySelectorAll(
            "main > div > div, main > div > div > *"
          ),
        ].every((element) => getComputedStyle(element).opacity === "1")
      )
    )
    .toBe(true)
}

test(
  "going back while the leaving page fades out shows the page once",
  { tag: "@motion" },
  async ({ page, isMobile }) => {
    await page.goto("/en")
    await mapAreaInstance(page)
    const normalSpeed = await slowAnimations(page)

    await openStockholm(page, isMobile)
    await fadingTo(page, "Stockholm")
    await page.goBack()
    await expect(page).toHaveURL("/en")
    await normalSpeed()
    await settled(page)

    // Home once, whole, and the capital gone
    await expect(page.locator("main [role='tablist']")).toHaveCount(1)
    await expect(page.locator("main h1")).toHaveCount(1)
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "How green is your capital?",
      })
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Helsinki leads the way." })
    ).toBeVisible()
    await expect(announcer(page)).toHaveText(/^How green is your capital\?/)

    // Its rows still open their capital
    await openStockholm(page, isMobile)
    await settled(page)
    await expect(page.locator("main h1")).toHaveText("Stockholm")
  }
)

test(
  "back then forward during the fades ends on the last page",
  { tag: "@motion" },
  async ({ page, isMobile }) => {
    await page.goto("/en")
    await mapAreaInstance(page)
    const normalSpeed = await slowAnimations(page)

    await openStockholm(page, isMobile)
    await fadingTo(page, "Stockholm")
    await page.goBack()
    await expect(page).toHaveURL("/en")
    await fadingTo(page, "How green is your capital?")
    await page.goForward()
    await expect(page).toHaveURL("/en/capitals/stockholm")
    await normalSpeed()
    await settled(page)

    await expect(page.locator("main h1")).toHaveCount(1)
    await expect(page.locator("main h1")).toHaveText("Stockholm")
    await expect(page.locator("main [role='tablist']")).toHaveCount(0)
    await expect(announcer(page)).toHaveText(/^Stockholm/)
  }
)
