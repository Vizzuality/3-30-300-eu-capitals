import { expect, test, type Page } from "@playwright/test"

import { colors } from "@/design/tokens"
import { clampZoom, fitArea, viewportOf, zoomLimits } from "@/map/camera"

/*
 * The map: moving it with the mouse, touch and the keyboard, its area kept
 * in the address, shared addresses, its colours following the theme, and
 * one map for the whole visit, kept on About and asleep on Methodology.
 */

type Area = { west: number; south: number; east: number; north: number }

const stockholm = "/en/capitals/stockholm"

// About 1.1 km across, on Södermalm
const sodermalm: Area = {
  west: 18.0603,
  south: 59.3105,
  east: 18.0802,
  north: 59.3201,
}
const sodermalmAt = "18.0603,59.3105,18.0802,59.3201"

const mapOf = (page: Page) => page.getByRole("application")

// The three paper tints of the EU countries on the Home map
const landTints: Array<{ light: string; dark: string }> = [
  colors.europeLand1,
  colors.europeLand2,
  colors.europeLand3,
]
const deckOf = (page: Page) => page.locator("[data-deck-instance]")

/**
 * Waits for the map to be drawn, and returns its deck.gl instance's id.
 * Setting up WebGL on Chrome's software renderer can take a few seconds
 * while other tests run alongside.
 */
async function mapDrawn(page: Page) {
  const deck = deckOf(page)
  await expect(deck).toHaveAttribute("data-drawing", "true", {
    timeout: 15_000,
  })
  await expect(deck).toHaveAttribute("data-frames", /^[1-9]/)
  return (await deck.getAttribute("data-deck-instance")) as string
}

/** The area in the address, if any */
function areaIn(page: Page): Area | undefined {
  const at = new URL(page.url()).searchParams.get("at")
  if (!at) {
    return undefined
  }
  const [west, south, east, north] = at.split(",").map(Number)
  return { west, south, east, north }
}

/** Waits for the map to write another area in the address */
async function nextArea(page: Page, before: Area | undefined) {
  await expect
    .poll(() => JSON.stringify(areaIn(page)))
    .not.toBe(JSON.stringify(before))
  const area = areaIn(page)
  expect(area).toBeDefined()
  return area as Area
}

const width = (area: Area) => area.east - area.west
const middle = (area: Area) => (area.west + area.east) / 2

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

/** The area of Europe shown on Home, shared in the address */
const europe = { west: -11, south: 34, east: 35, north: 62 }

/**
 * The colour the map shows around a place, as #rrggbb: the most frequent in
 * a small square, so a line crossing it (the sea's hatching) does not count
 */
async function colourAt(page: Page, [longitude, latitude]: [number, number]) {
  const map = mapOf(page)
  await map.scrollIntoViewIfNeeded()
  const box = (await map.boundingBox()) as {
    x: number
    y: number
    width: number
    height: number
  }
  // Where the place is, as the map fits the shared area
  const size = { width: box.width, height: box.height }
  const fitted = fitArea(europe, size)
  const camera = { ...fitted, zoom: clampZoom(fitted.zoom, zoomLimits.home) }
  const [x, y] = viewportOf(camera, size).project([longitude, latitude])
  const shot = await page.screenshot({
    clip: { x: box.x + x - 4, y: box.y + y - 4, width: 9, height: 9 },
  })
  return page.evaluate(async (data) => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = document.createElement("canvas")
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext("2d") as CanvasRenderingContext2D
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, image.width, image.height).data
    const counts = new Map<string, number>()
    for (let at = 0; at < pixels.length; at += 4) {
      const hex = `#${[...pixels.subarray(at, at + 3)].map((v) => v.toString(16).padStart(2, "0")).join("")}`
      counts.set(hex, (counts.get(hex) ?? 0) + 1)
    }
    // The most frequent colour
    return [...counts].reduce((most, entry) =>
      entry[1] > most[1] ? entry : most
    )[0]
  }, shot.toString("base64"))
}

/** Waits for a number of frames of the browser to pass */
function frames(page: Page, count: number) {
  return page.evaluate(
    (total) =>
      new Promise<void>((done) => {
        let left = total
        const next = () => (--left <= 0 ? done() : requestAnimationFrame(next))
        requestAnimationFrame(next)
      }),
    count
  )
}

test.describe("with a mouse", () => {
  test.skip(({ isMobile }) => isMobile, "A mouse drags and scrolls the map")

  test("dragging and scrolling move the map, and the address follows", async ({
    page,
  }) => {
    await page.goto(stockholm)
    await mapDrawn(page)
    // The whole city, as the page opens: nothing in the address yet
    expect(areaIn(page)).toBeUndefined()
    const entries = await page.evaluate(() => history.length)

    const box = (await mapOf(page).boundingBox()) as {
      x: number
      y: number
      width: number
      height: number
    }
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await page.mouse.move(centre.x, centre.y)
    await page.mouse.down()
    await page.mouse.move(centre.x - 200, centre.y, { steps: 10 })
    await page.mouse.up()
    const dragged = await nextArea(page, undefined)
    // Dragged to the left: the map shows more of the east
    expect(middle(dragged)).toBeGreaterThan(18.0)

    await page.mouse.wheel(0, -600)
    const zoomed = await nextArea(page, dragged)
    expect(width(zoomed)).toBeLessThan(width(dragged))

    // The address changes in place: no new step in the history
    expect(await page.evaluate(() => history.length)).toBe(entries)
  })

  test("the zoom buttons zoom, and stop at the map's limits", async ({
    page,
  }) => {
    await page.goto("/en")
    await mapDrawn(page)
    const zoomIn = page.getByRole("button", { name: "Zoom in" })
    const zoomOut = page.getByRole("button", { name: "Zoom out" })

    await zoomIn.click()
    const closer = await nextArea(page, undefined)
    await zoomOut.click()
    const farther = await nextArea(page, closer)
    expect(width(farther)).toBeGreaterThan(width(closer))

    // Europe zooms out to the whole continent, no farther: more clicks
    // than it takes (each from where the last one ends, even mid-glide,
    // so a click on the button as it turns disabled is forced)
    for (let clicks = 0; clicks < 4; clicks += 1) {
      await zoomOut.click({ force: true })
    }
    await expect(zoomOut).toBeDisabled()
    await expect(zoomIn).toBeEnabled()
  })
})

test("the keyboard moves the map, with its key hint", async ({ page }) => {
  await page.goto(stockholm)
  await mapDrawn(page)
  const hint = page.locator("[data-key-hint]")
  await expect(hint).toBeHidden()

  await tabToMap(page)
  await expect(hint).toBeVisible()
  await expect(hint).toContainText("Arrow keys move")
  const scrolled = await page.evaluate(() => window.scrollY)

  await page.keyboard.press("ArrowRight")
  const right = await nextArea(page, undefined)
  await page.keyboard.press("+")
  const closer = await nextArea(page, right)
  // One zoom level: half as wide, around the same centre
  expect(width(closer) / width(right)).toBeCloseTo(0.5, 2)
  expect(middle(closer)).toBeCloseTo(middle(right), 3)

  await page.keyboard.press("ArrowLeft")
  const left = await nextArea(page, closer)
  expect(middle(left)).toBeLessThan(middle(closer))

  // The page itself does not scroll with the arrow keys
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled)
})

test("a shared address shows its area, on any screen", async ({ page }) => {
  await page.goto(`${stockholm}?at=${sodermalmAt}`)
  await mapDrawn(page)
  // Narrower than 1.5 km: the street
  await expect(
    page
      .getByText(/(Click|Tap) a building to see why it scores as it does/)
      .filter({ visible: true })
  ).toBeVisible()

  // A move there and back writes the area the map shows
  await mapOf(page).focus()
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("ArrowLeft")
  const shown = await nextArea(page, sodermalm)

  // The whole shared area is in view, and fills the map one way
  const hair = 1e-5
  expect(shown.west).toBeLessThanOrEqual(sodermalm.west + hair)
  expect(shown.east).toBeGreaterThanOrEqual(sodermalm.east - hair)
  expect(shown.south).toBeLessThanOrEqual(sodermalm.south + hair)
  expect(shown.north).toBeGreaterThanOrEqual(sodermalm.north - hair)
  const fillsWidth =
    Math.abs(shown.west - sodermalm.west) < hair &&
    Math.abs(shown.east - sodermalm.east) < hair
  const fillsHeight =
    Math.abs(shown.south - sodermalm.south) < hair &&
    Math.abs(shown.north - sodermalm.north) < hair
  expect(fillsWidth || fillsHeight).toBe(true)
})

test("the map of Europe follows the theme, without reloading", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" })
  await page.goto(
    `/en?at=${europe.west},${europe.south},${europe.east},${europe.north}`
  )
  const instance = await mapDrawn(page)
  await page.evaluate(() => {
    ;(window as unknown as { stayed: boolean }).stayed = true
  })
  // The North Sea, and the middle of France, an EU country in one of the
  // three paper tints
  const sea: [number, number] = [3, 55.5]
  const france: [number, number] = [2.6, 46.6]

  await expect.poll(() => colourAt(page, sea)).toBe(colors.europeSea.light)
  await expect
    .poll(async () =>
      landTints.map((tint) => tint.light).includes(await colourAt(page, france))
    )
    .toBe(true)

  await page.emulateMedia({ colorScheme: "dark" })
  await expect.poll(() => colourAt(page, sea)).toBe(colors.europeSea.dark)
  await expect
    .poll(async () =>
      landTints.map((tint) => tint.dark).includes(await colourAt(page, france))
    )
    .toBe(true)

  expect(
    await page.evaluate(
      () => (window as unknown as { stayed?: boolean }).stayed
    )
  ).toBe(true)
  await expect(deckOf(page)).toHaveAttribute("data-deck-instance", instance)
})

test("About and Methodology keep the same map, asleep on Methodology", async ({
  page,
  isMobile,
}) => {
  const siteLinks = page
    .getByRole("banner")
    .getByRole("navigation", { name: "Site" })
  await page.goto(stockholm)
  const instance = await mapDrawn(page)
  const deck = deckOf(page)

  await siteLinks.getByRole("link", { name: "About" }).click()
  await expect(page).toHaveURL("/en/about")
  await expect(deck).toHaveAttribute("data-deck-instance", instance)
  // Shown beside the panel on desktop; phones have no map band on About
  await expect(deck).toHaveAttribute(
    "data-drawing",
    isMobile ? "false" : "true"
  )

  await siteLinks.getByRole("link", { name: "Methodology" }).click()
  await expect(page).toHaveURL("/en/methodology")
  await expect(deck).toHaveAttribute("data-deck-instance", instance)
  await expect(deck).toHaveAttribute("data-drawing", "false")
  // No frame is drawn while it is hidden, even when the theme changes
  const asleep = await deck.getAttribute("data-frames")
  await page.emulateMedia({ colorScheme: "dark" })
  await frames(page, 30)
  await expect(deck).toHaveAttribute("data-frames", asleep as string)

  await page.goBack()
  await page.goBack()
  await expect(page).toHaveURL(stockholm)
  await expect(deck).toHaveAttribute("data-drawing", "true")
  await expect(deck).toHaveAttribute("data-deck-instance", instance)
  // It draws again, the new colours included
  await expect
    .poll(async () => Number(await deck.getAttribute("data-frames")))
    .toBeGreaterThan(Number(asleep))
})

/** A touch drag through the browser's own input, finger by finger */
async function touchDrag(
  page: Page,
  fingers: Array<{ x: number; y: number }>,
  by: { x: number; y: number }
) {
  const client = await page.context().newCDPSession(page)
  const at = (step: number) =>
    fingers.map(({ x, y }, id) => ({
      x: x + (by.x * step) / 10,
      y: y + (by.y * step) / 10,
      id,
    }))
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: at(0),
  })
  for (let step = 1; step <= 10; step += 1) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: at(step),
    })
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })
  await client.detach()
}

test.describe("on a touch screen", () => {
  test.skip(({ isMobile }) => !isMobile, "The phone's map band")

  test("one finger scrolls the page, two move the map", async ({ page }) => {
    await page.goto(stockholm)
    await mapDrawn(page)
    const map = mapOf(page)
    // The band's top at the middle of the screen, the page left to scroll
    await map.evaluate((band) => {
      const top = band.getBoundingClientRect().top + window.scrollY
      window.scrollTo(0, top - window.innerHeight / 2)
    })
    const box = (await map.boundingBox()) as {
      x: number
      y: number
      width: number
      height: number
    }
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 3 }

    // One finger up the band scrolls the page, and leaves the map
    const scrolled = await page.evaluate(() => window.scrollY)
    await touchDrag(page, [centre], { x: 0, y: -150 })
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(scrolled + 50)
    expect(areaIn(page)).toBeUndefined()
    // Once the page has stopped scrolling
    await page.evaluate(
      () =>
        new Promise<void>((done) => {
          let last = window.scrollY
          let still = 0
          const check = () => {
            still = window.scrollY === last ? still + 1 : 0
            last = window.scrollY
            if (still >= 10) {
              done()
            } else {
              requestAnimationFrame(check)
            }
          }
          requestAnimationFrame(check)
        })
    )

    // One finger sideways, in the middle of the band where the scroll left
    // it: the hint says to use two (watched from the start: it shows for
    // 2 s, and a slow drag can last as long)
    const now = (await map.boundingBox()) as typeof box
    const y = now.y + now.height / 2
    const hint = page.getByText("Use two fingers to move the map")
    const hintShown = expect(hint).toBeVisible({ timeout: 10_000 })
    await touchDrag(page, [{ x: now.x + now.width / 2, y }], {
      x: -120,
      y: 0,
    })
    await hintShown
    await expect(hint).toBeHidden()

    // Two fingers move the map, and the address follows
    await touchDrag(
      page,
      [
        { x: now.x + now.width * 0.4, y },
        { x: now.x + now.width * 0.6, y },
      ],
      { x: -100, y: 0 }
    )
    const moved = await nextArea(page, undefined)
    expect(middle(moved)).toBeGreaterThan(18.0)
  })
})
