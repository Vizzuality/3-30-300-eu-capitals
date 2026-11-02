import { expect, test, type Page } from "@playwright/test"

import { clampZoom, fitArea, viewportOf, zoomLimits } from "@/map/camera"
import { hydrated } from "./page-ready"

/*
 * The Home map's capitals: hovering one shows its label and highlights its
 * ranking row, and hovering a row lifts its capital; clicking a capital, or
 * Tab to it then Enter, opens its page. Also the tile route that draws the
 * map of Europe.
 */

// The area shown, shared in the address, so the test knows where each
// capital is drawn
const europe = { west: -11, south: 34, east: 35, north: 62 }
const home = `/en?at=${europe.west},${europe.south},${europe.east},${europe.north}`

const mapOf = (page: Page) => page.getByRole("application")
const deckOf = (page: Page) => page.locator("[data-deck-instance]")
const labelOf = (page: Page) => page.locator("[data-hover-label]")
const liveRegion = (page: Page) => page.locator("[data-map] output.sr-only")

/** Waits for the map to be drawn, its camera on the shared area */
async function mapDrawn(page: Page) {
  await hydrated(page)
  await expect(deckOf(page)).toHaveAttribute("data-drawing", "true")
  await expect(deckOf(page)).toHaveAttribute("data-frames", /^[1-9]/)
}

/** Where a capital is drawn on the page: the middle of its outline */
async function capitalPoint(page: Page, slug: string) {
  const response = await page.request.get("/api/stand-in/capitals")
  const { capitals } = (await response.json()) as {
    capitals: Array<{ slug: string; display: [number, number] }>
  }
  const capital = capitals.find((each) => each.slug === slug)
  if (!capital) {
    throw new Error(`${slug} is not in the release`)
  }
  await mapOf(page).scrollIntoViewIfNeeded()
  const box = await mapOf(page).boundingBox()
  if (!box) {
    throw new Error("The map is not on screen")
  }
  // As the map fits a shared area: as large as it fits, within its zooms
  const size = { width: box.width, height: box.height }
  const fitted = fitArea(europe, size)
  const camera = { ...fitted, zoom: clampZoom(fitted.zoom, zoomLimits.home) }
  const [x, y] = viewportOf(camera, size).project(capital.display)
  return { x: box.x + x, y: box.y + y }
}

/** Whether a ranking row has the list's highlight resting on it */
function rowHighlighted(page: Page, slug: string) {
  return page.evaluate((rowSlug) => {
    const row = document.querySelector<HTMLElement>(
      `ol [data-slug="${rowSlug}"]`
    )
    const highlight = row
      ?.closest("ol")
      ?.parentElement?.querySelector<HTMLElement>("[data-slot='row-highlight']")
    if (!row || !highlight) {
      return false
    }
    const [rowBox, box] = [row, highlight].map((element) =>
      element.getBoundingClientRect()
    )
    return (
      getComputedStyle(highlight).opacity === "1" &&
      Math.abs(rowBox.top - box.top) < 1 &&
      Math.abs(rowBox.bottom - box.bottom) < 1
    )
  }, slug)
}

/** Tabs through the page until the map has the keyboard's focus */
async function tabToMap(page: Page) {
  for (let presses = 0; presses < 80; presses += 1) {
    const onMap = await mapOf(page).evaluate(
      (map) => document.activeElement === map
    )
    if (onMap) {
      return
    }
    await page.keyboard.press("Tab")
  }
  throw new Error("The map was not reached with Tab")
}

test.describe("with a mouse", () => {
  test.skip(({ isMobile }) => isMobile, "Fingers do not hover")

  test("hovering a capital shows its label and highlights its ranking row", async ({
    page,
  }) => {
    await page.goto(home)
    await mapDrawn(page)
    await expect(labelOf(page)).toHaveCount(0)

    const berlin = await capitalPoint(page, "berlin")
    await page.mouse.move(berlin.x, berlin.y)
    await expect(labelOf(page)).toContainText("Berlin")
    await expect(labelOf(page)).toContainText("Germany")
    await expect(labelOf(page)).toContainText("meet all three rules")
    await expect(deckOf(page)).toHaveAttribute("data-lifted", "berlin")
    await expect.poll(() => rowHighlighted(page, "berlin")).toBe(true)
    await expect(liveRegion(page)).toHaveText(/^Berlin, Germany, rank 2 of 27:/)

    // Off the capital, its label leaves and its row lets go
    const box = await mapOf(page).boundingBox()
    await page.mouse.move((box?.x ?? 0) + 4, (box?.y ?? 0) + 4)
    await expect(labelOf(page)).toHaveCount(0)
    await expect(deckOf(page)).toHaveAttribute("data-lifted", "")
    await expect.poll(() => rowHighlighted(page, "berlin")).toBe(false)
  })

  test("hovering a ranking row lifts its capital, without a label", async ({
    page,
  }) => {
    await page.goto(home)
    await mapDrawn(page)

    await page.getByRole("link", { name: /^Nicosia, rank 3:/ }).hover()
    await expect(deckOf(page)).toHaveAttribute("data-lifted", "nicosia")
    await expect(labelOf(page)).toHaveCount(0)

    await page.getByRole("link", { name: /^Berlin, rank 2:/ }).hover()
    await expect(deckOf(page)).toHaveAttribute("data-lifted", "berlin")
  })
})

test("clicking a capital opens its page", async ({ page, isMobile }) => {
  await page.goto(home)
  await mapDrawn(page)

  const berlin = await capitalPoint(page, "berlin")
  const press = (x: number, y: number) =>
    isMobile ? page.touchscreen.tap(x, y) : page.mouse.click(x, y)
  // A first press on the sea, where nothing opens: on Chrome's software
  // renderer, deck.gl's first pick on a press takes about a second, and
  // the press then counts as too long to be a click
  const box = await mapOf(page).boundingBox()
  await press((box?.x ?? 0) + 8, (box?.y ?? 0) + (box?.height ?? 0) / 2)
  await press(berlin.x, berlin.y)
  await expect(page).toHaveURL("/en/capitals/berlin")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Berlin")
})

test("Tab goes through the capitals in ranking order, and Enter opens one", async ({
  page,
}) => {
  await page.goto(home)
  await mapDrawn(page)

  await tabToMap(page)
  await page.keyboard.press("Tab")
  await expect(mapOf(page)).toBeFocused()
  await expect(liveRegion(page)).toHaveText(/^Helsinki, Finland, rank 1 of 27:/)
  await expect(labelOf(page)).toContainText("Helsinki")
  await expect(deckOf(page)).toHaveAttribute("data-lifted", "helsinki")
  await expect.poll(() => rowHighlighted(page, "helsinki")).toBe(true)

  await page.keyboard.press("Tab")
  await expect(liveRegion(page)).toHaveText(/^Berlin, Germany, rank 2 of 27:/)
  await page.keyboard.press("Shift+Tab")
  await expect(liveRegion(page)).toHaveText(/^Helsinki, Finland, rank 1 of 27:/)

  await page.keyboard.press("Enter")
  await expect(page).toHaveURL("/en/capitals/helsinki")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Helsinki")
  // The page opened from the map, which keeps the focus
  await expect(mapOf(page)).toBeFocused()
})

test("Tab leaves the map after the last capital", async ({ page }) => {
  await page.goto(home)
  await mapDrawn(page)

  await tabToMap(page)
  for (let presses = 0; presses < 27; presses += 1) {
    await page.keyboard.press("Tab")
  }
  await expect(liveRegion(page)).toHaveText(/, rank 27 of 27:/)
  await page.keyboard.press("Tab")
  await expect(mapOf(page)).not.toBeFocused()
  await expect(labelOf(page)).toHaveCount(0)
})

test("the Home map's tiles are sent with a tag, then not again", async ({
  request,
}) => {
  const address = "/api/stand-in/europe/tiles/3/4/2"
  const tile = await request.get(address)
  expect(tile.status()).toBe(200)
  expect(tile.headers()["content-type"]).toBe(
    "application/vnd.mapbox-vector-tile"
  )
  expect(tile.headers()["content-encoding"]).toBe("gzip")
  expect(tile.headers()["cache-control"]).toBe("no-cache")
  const etag = tile.headers().etag
  expect(etag).toMatch(/^"[0-9a-f]{32}"$/)
  expect((await tile.body()).byteLength).toBeGreaterThan(0)

  const again = await request.get(address, {
    headers: { "If-None-Match": etag },
  })
  expect(again.status()).toBe(304)

  // A place with nothing in it, a zoom the archive does not have, and an
  // archive the stand-in does not have
  expect((await request.get("/api/stand-in/europe/tiles/7/0/0")).status()).toBe(
    204
  )
  expect((await request.get("/api/stand-in/europe/tiles/8/0/0")).status()).toBe(
    404
  )
  expect(
    (
      await request.get("/api/stand-in/capitals/helsinki/tiles/city/14/0/0")
    ).status()
  ).toBe(404)
})
