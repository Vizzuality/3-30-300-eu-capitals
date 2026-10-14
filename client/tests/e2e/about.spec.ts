import { expect, test, type Page } from "@playwright/test"

/*
 * About, opened from the top bar, leads back to the page it was opened from,
 * as that page was left (its tab, or its building and rule); opened
 * directly, it leads to Home. The footer leads to Vizzuality.
 */

/** Waits for the page to be hydrated, so its links are the router's */
async function hydrated(page: Page) {
  await expect(page.locator("[data-map-area]")).toHaveAttribute(
    "data-instance",
    /.+/
  )
}

async function expectPage(page: Page, path: string, heading: string) {
  await expect(page).toHaveURL(path)
  await expect(
    page.getByRole("heading", { level: 1, name: heading })
  ).toBeVisible()
  // Once the leaving page has faded out
  await expect(page.locator("main [inert]")).toHaveCount(0)
}

async function openAbout(page: Page) {
  await page
    .getByRole("navigation", { name: "Site" })
    .getByRole("link", { name: "About" })
    .click()
  await expectPage(page, "/en/about", "About this site")
}

const backLink = (page: Page, name: string) =>
  page.getByRole("main").getByRole("link", { name })

test("About opened from Home leads back to Home, on the tab left open", async ({
  page,
}) => {
  await page.goto("/en?tab=az")
  await hydrated(page)

  await openAbout(page)
  await backLink(page, "Back to the map").click()
  await expectPage(page, "/en?tab=az", "How green is your capital?")
  await expect(page.getByRole("tab", { name: "A–Z list" })).toHaveAttribute(
    "aria-selected",
    "true"
  )

  // The back link went back in the history: About is the next entry
  await page.goForward()
  await expectPage(page, "/en/about", "About this site")
  await expect(backLink(page, "Back to the map")).toHaveAttribute(
    "href",
    "/en?tab=az"
  )
})

test("About opened from a capital leads back to its building and rule", async ({
  page,
}) => {
  await page.goto("/en/capitals/stockholm?building=31947&rule=30")
  await hydrated(page)

  await openAbout(page)
  await backLink(page, "Back to the map").click()
  await expectPage(
    page,
    "/en/capitals/stockholm?building=31947&rule=30",
    "Stockholm"
  )
  await expect(
    page.getByRole("radio", { name: "30 % canopy not met" })
  ).toBeChecked()
})

test("About opened from Methodology leads back to Methodology, also after a reload", async ({
  page,
}) => {
  await page.goto("/en/methodology")
  await hydrated(page)

  await openAbout(page)
  // The page it was opened from is kept with About's history entry
  await page.reload()
  await hydrated(page)
  await backLink(page, "Back to Methodology").click()
  await expectPage(page, "/en/methodology", "How we checked every home")
})

test("About opened directly leads to Home", async ({ page }) => {
  await page.goto("/en/about")
  await hydrated(page)

  await backLink(page, "Back to the map").click()
  await expectPage(page, "/en", "How green is your capital?")
})

test("About opened again from About keeps the page it came from", async ({
  page,
}) => {
  await page.goto("/en/methodology")
  await hydrated(page)

  await openAbout(page)
  await openAbout(page)
  await backLink(page, "Back to Methodology").click()
  await expectPage(page, "/en/methodology", "How we checked every home")
})

test("the footer leads to Vizzuality, on Home and on a capital", async ({
  page,
}) => {
  // Vizzuality's site, answered here so the test does not leave the machine
  await page.route("https://www.vizzuality.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Vizzuality</title><h1>Vizzuality</h1>",
    })
  )

  for (const path of ["/en", "/en/capitals/stockholm"]) {
    await page.goto(path)
    await hydrated(page)
    const footer = page.getByRole("contentinfo")
    await expect(footer).toContainText("Made by Vizzuality")
    // The code is linked once it is public
    await expect(footer.getByRole("link")).toHaveCount(1)

    await footer.getByRole("link", { name: "Vizzuality" }).click()
    await expect(page).toHaveURL("https://www.vizzuality.com/")
    await expect(page).toHaveTitle("Vizzuality")
  }
})

test("About's title and description are in the server's HTML", async ({
  request,
}) => {
  const response = await request.get("/en/about")
  expect(response.status()).toBe(200)
  const html = await response.text()

  expect(html).toContain(
    "<title>About this site: the research and open data behind it · 3-30-300</title>"
  )
  expect(html).toMatch(
    /<meta name="description" content="The research behind the 3-30-300 maps of the 27 EU capitals, the open data they use with its licences and credits, and who made the site\."\/?>/
  )
  // The credits, from the release's sources, without JavaScript
  expect(html).toContain("European Commission, Joint Research Centre")
  expect(html).toContain("Made with Natural Earth")
})
