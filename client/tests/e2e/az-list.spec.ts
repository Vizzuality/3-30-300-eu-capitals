import { expect, test, type Locator, type Page } from "@playwright/test"

/*
 * Finding a capital in Home's A–Z list: switching to it, searching by a
 * local name typed without its accents or by a country, a search that finds
 * nothing, and the tab kept in the address.
 */

async function hydrated(page: Page) {
  await expect(page.locator("[data-map-area]")).toHaveAttribute(
    "data-instance",
    /.+/
  )
}

const tab = (page: Page, name: "Ranking" | "A–Z list") =>
  page.getByRole("tab", { name })

const searchField = (page: Page) =>
  page.getByRole("searchbox", { name: "Find a capital or a country" })

/** The rows of the A–Z list, by their capital's name and country */
const rows = (page: Page) =>
  page.getByRole("tabpanel").getByRole("link", { name: /^[^:]+, [^:]+$/ })

async function press(target: Locator, isMobile: boolean) {
  if (isMobile) {
    await target.tap()
  } else {
    await target.click()
  }
}

async function openAzList(page: Page, isMobile: boolean) {
  await tab(page, "A–Z list").scrollIntoViewIfNeeded()
  await press(tab(page, "A–Z list"), isMobile)
  await expect(page).toHaveURL("/en?tab=az")
  await expect(tab(page, "A–Z list")).toHaveAttribute("aria-selected", "true")
}

test("switching to the A–Z list loads nothing", async ({ page, isMobile }) => {
  await page.goto("/en")
  await hydrated(page)

  // Requests to the data API
  const requests: Array<string> = []
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) {
      requests.push(request.url())
    }
  })
  await openAzList(page, isMobile)

  // Every capital, in alphabetical order, without the ranking
  await expect(rows(page)).toHaveCount(27)
  await expect(rows(page).first()).toHaveAccessibleName(
    "Amsterdam, Netherlands"
  )
  await expect(rows(page).last()).toHaveAccessibleName("Zagreb, Croatia")
  await expect(
    page.getByRole("heading", { name: "Helsinki leads the way." })
  ).toBeHidden()
  expect(requests).toEqual([])
})

test("a capital found by its local name, typed without accents", async ({
  page,
  isMobile,
}) => {
  await page.goto("/en")
  await hydrated(page)
  await openAzList(page, isMobile)

  await searchField(page).fill("Kobenhavn")
  await expect(rows(page)).toHaveCount(1)
  await press(page.getByRole("link", { name: "Copenhagen, Denmark" }), isMobile)

  await expect(page).toHaveURL("/en/capitals/copenhagen")
  await expect(
    page.getByRole("heading", { level: 1, name: "Copenhagen", exact: true })
  ).toBeVisible()
})

test("a capital found by its country", async ({ page, isMobile }) => {
  await page.goto("/en")
  await hydrated(page)
  await openAzList(page, isMobile)

  await searchField(page).fill("sweden")
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toHaveAccessibleName("Stockholm, Sweden")
})

test("a search that finds nothing, then cleared", async ({
  page,
  isMobile,
}) => {
  await page.goto("/en")
  await hydrated(page)
  await openAzList(page, isMobile)

  await searchField(page).fill("qx")
  await expect(
    page.getByText("No capital or country matches “qx”")
  ).toBeVisible()
  await expect(rows(page)).toHaveCount(0)

  await press(page.getByRole("button", { name: "Clear the search" }), isMobile)
  await expect(searchField(page)).toHaveValue("")
  await expect(searchField(page)).toBeFocused()
  await expect(rows(page)).toHaveCount(27)

  // Escape clears it too
  await searchField(page).fill("qx")
  await page.keyboard.press("Escape")
  await expect(searchField(page)).toHaveValue("")
  await expect(rows(page)).toHaveCount(27)
})

test("the tab open survives a reload, back and forward", async ({
  page,
  isMobile,
}) => {
  await page.goto("/en")
  await hydrated(page)
  await openAzList(page, isMobile)

  await page.reload()
  await hydrated(page)
  await expect(tab(page, "A–Z list")).toHaveAttribute("aria-selected", "true")
  await expect(rows(page)).toHaveCount(27)

  // Back to the ranking, then forward to the A–Z list
  await page.goBack()
  await expect(page).toHaveURL("/en")
  await expect(tab(page, "Ranking")).toHaveAttribute("aria-selected", "true")
  await expect(
    page.getByRole("heading", { name: "Helsinki leads the way." })
  ).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL("/en?tab=az")
  await expect(tab(page, "A–Z list")).toHaveAttribute("aria-selected", "true")

  // A capital opened from the list, then back to the list
  await press(page.getByRole("link", { name: "Vienna, Austria" }), isMobile)
  await expect(page).toHaveURL("/en/capitals/vienna")
  await expect(
    page.getByRole("heading", { level: 1, name: "Vienna", exact: true })
  ).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL("/en?tab=az")
  await expect(tab(page, "A–Z list")).toHaveAttribute("aria-selected", "true")
})

test("a tab that does not exist opens the ranking", async ({ page }) => {
  await page.goto("/en?tab=list")
  await hydrated(page)

  await expect(tab(page, "Ranking")).toHaveAttribute("aria-selected", "true")
})

test("the tabs share the track's width equally", async ({ page }) => {
  for (const path of ["/en", "/de"]) {
    await page.goto(path)
    await hydrated(page)

    const track = await page.getByRole("tablist").boundingBox()
    const ranking = await tab(page, "Ranking").boundingBox()
    const az = await tab(page, "A–Z list").boundingBox()
    if (!track || !ranking || !az) {
      throw new Error("The tabs are not on screen")
    }
    expect(Math.abs(ranking.width - az.width)).toBeLessThan(0.5)
    // Across the whole track, inside its 4 px padding and gap
    expect(ranking.width + az.width + 12).toBeCloseTo(track.width, 0)
  }
})
