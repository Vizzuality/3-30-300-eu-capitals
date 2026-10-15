import { expect, test, type Page } from "@playwright/test"

import { hydrated } from "./page-ready"

/*
 * The map area is given an id once it mounts in the browser. While the id
 * stays the same, the area (and later the map) has not been remounted.
 */
async function mapAreaInstance(page: Page) {
  const mapArea = page.locator("[data-map-area]")
  // Also waits for the page to be hydrated, and its map set up
  await hydrated(page)
  return (await mapArea.getAttribute("data-instance")) as string
}

async function expectSameMapArea(page: Page, instance: string) {
  await expect(page.locator("[data-map-area]")).toHaveAttribute(
    "data-instance",
    instance
  )
}

const DESKTOP = { width: 1280, height: 800 }
const PHONE = { width: 390, height: 844 }

/*
 * The order in which keyboard and screen reader users meet the parts of the
 * page: on desktop the map area comes after the footer; on phones the band
 * sits in the page's content, between what comes before and after it (on
 * a capital's page, its middle block and Other capitals come after it).
 */
async function readingOrder(page: Page) {
  return page.evaluate(() => {
    const parts = document.querySelectorAll(
      "header, main, h1, h2, footer, [data-map-area]"
    )
    return {
      order: [...parts].map((element) => {
        if (element.matches("[data-map-area]")) {
          return "map area"
        }
        return element.matches("h1, h2")
          ? element.textContent
          : element.tagName.toLowerCase()
      }),
      inMain: document.querySelector("main [data-map-area]") !== null,
    }
  })
}

async function expectReadingOrder(page: Page, layout: "desktop" | "phone") {
  // The area moves once the browser reports the new width
  await expect
    .poll(() => readingOrder(page))
    .toEqual(
      layout === "desktop"
        ? {
            order: [
              "header",
              "main",
              "Stockholm",
              "Residents meeting each rule",
              "Other capitals",
              "footer",
              "map area",
            ],
            inMain: false,
          }
        : {
            order: [
              "header",
              "main",
              "Stockholm",
              "map area",
              "Residents meeting each rule",
              "Other capitals",
              "footer",
            ],
            inMain: true,
          }
    )
}

async function expectPage(page: Page, path: string, heading: string) {
  await expect(page).toHaveURL(path)
  await expect(
    page.getByRole("heading", { level: 1, name: heading })
  ).toBeVisible()
}

test("moving between pages keeps the map area", async ({ page }) => {
  const topBar = page.getByRole("banner")
  const siteLinks = topBar.getByRole("navigation", { name: "Site" })

  await page.goto("/en")
  await expectPage(page, "/en", "How green is your capital?")
  const instance = await mapAreaInstance(page)

  await siteLinks.getByRole("link", { name: "Methodology" }).click()
  await expectPage(page, "/en/methodology", "How we checked every home")
  await expectSameMapArea(page, instance)

  await siteLinks.getByRole("link", { name: "About" }).click()
  await expectPage(page, "/en/about", "About this site")
  await expectSameMapArea(page, instance)

  // No page links to a capital yet: it is opened from its address
  await page.goto("/en/capitals/stockholm")
  await expectPage(page, "/en/capitals/stockholm", "Stockholm")
  const capitalInstance = await mapAreaInstance(page)

  // Across the breakpoint, the map area moves to the other layout's place
  // without being remounted
  for (const [size, layout] of [
    [DESKTOP, "desktop"],
    [PHONE, "phone"],
    [DESKTOP, "desktop"],
  ] as const) {
    await page.setViewportSize(size)
    await expectReadingOrder(page, layout)
    await expectSameMapArea(page, capitalInstance)
  }

  await topBar.getByRole("link", { name: "3-30-300, back to Home" }).click()
  await expectPage(page, "/en", "How green is your capital?")
  await expectSameMapArea(page, capitalInstance)
})

test("changing the language keeps the page and the map area", async ({
  page,
}) => {
  await page.goto("/en/about")
  const instance = await mapAreaInstance(page)
  await expect(page.locator("html")).toHaveAttribute("lang", "en")

  // The language list comes later. Until then the language is changed in the
  // address through the History API, which the router follows without
  // reloading the page, as it will for the list.
  await page.evaluate(() => window.history.pushState({}, "", "/fr/about"))

  // Other languages show English until they are translated
  await expectPage(page, "/fr/about", "About this site")
  await expect(page.locator("html")).toHaveAttribute("lang", "fr")
  await expectSameMapArea(page, instance)

  await page
    .getByRole("navigation", { name: "Site" })
    .getByRole("link", { name: "Methodology" })
    .click()
  await expectPage(page, "/fr/methodology", "How we checked every home")
  await expectSameMapArea(page, instance)
})

test("the site name is the current page on Home only", async ({ page }) => {
  const siteName = page
    .getByRole("banner")
    .getByRole("link", { name: "3-30-300, back to Home" })
  // Once the page is hydrated; the map setting up WebGL does not matter here
  const pageHydrated = () =>
    expect(page.locator("[data-map-area]")).toHaveAttribute(
      "data-instance",
      /.+/
    )

  for (const path of ["/en", "/en?tab=az", "/de"]) {
    await page.goto(path)
    await pageHydrated()
    await expect(siteName).toHaveAttribute("aria-current", "page")
  }
  for (const path of ["/en/capitals/stockholm", "/en/about"]) {
    await page.goto(path)
    await pageHydrated()
    await expect(siteName).not.toHaveAttribute("aria-current")
  }
})
