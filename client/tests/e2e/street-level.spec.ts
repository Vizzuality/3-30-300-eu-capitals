import { expect, test, type Page } from "@playwright/test"

import { groundWidth, streetLevelWidth } from "@/lib/visible-area"

/*
 * A capital's street level, on the stand-in's corner of Stockholm's city map
 * (central Södermalm): the street reached from the city overview, with its
 * buildings and the guide's pulse on one of them; the
 * buildings nearest the centre gone through with the keyboard and one
 * selected; the arrival, with motion.
 */

const stockholm = "/en/capitals/stockholm"
// About 4 km across, around central Södermalm: the city overview
const overviewAt = "18.0385,59.3055,18.1085,59.3255"
// About 600 m across, centred on building 4176, one of the stand-in's
// buildings with figures (1 rule met)
const streetAt = "18.0698,59.3092,18.0805,59.3144"

const mapOf = (page: Page) => page.getByRole("application")
const deckOf = (page: Page) => page.locator("[data-deck-instance]")
const liveRegion = (page: Page) => page.locator("[data-map] output.sr-only")
const streetPulse = (page: Page) => page.locator('[data-pulse-tag="street"]')

/** Waits for the map to be drawn */
async function mapDrawn(page: Page) {
  await expect(deckOf(page)).toHaveAttribute("data-drawing", "true")
  await expect(deckOf(page)).toHaveAttribute("data-frames", /^[1-9]/)
}

/** Waits for the street's tiles in view to be loaded */
async function streetDrawn(page: Page) {
  await expect(deckOf(page)).toHaveAttribute("data-street-tiles", /^[1-9]/)
}

/** Follows the arrival's phases from now on */
async function watchArrival(page: Page) {
  await page.evaluate(() => {
    const deck = document.querySelector<HTMLElement>("[data-deck-instance]")
    const seen: Array<string> = []
    Object.assign(window, { arrivalPhases: seen })
    new MutationObserver(() =>
      seen.push(deck?.dataset.streetArrival ?? "")
    ).observe(deck as HTMLElement, {
      attributes: true,
      attributeFilter: ["data-street-arrival"],
    })
  })
}

/**
 * Waits for the arrival to wait for the street's tiles, then run, then
 * rest, each in turn
 */
async function arrived(page: Page) {
  const phases = () =>
    page.evaluate(() =>
      (
        window as unknown as { arrivalPhases: Array<string> }
      ).arrivalPhases.join()
    )
  await expect.poll(phases).toMatch(/armed/)
  await expect.poll(phases).toMatch(/armed.*running/)
  await expect.poll(phases).toMatch(/armed.*running.*off$/)
  await expect(deckOf(page)).toHaveAttribute("data-street-arrival", "off")
}

/** The area in the address */
function areaIn(page: Page) {
  const at = new URL(page.url()).searchParams.get("at") ?? ""
  const [west, south, east, north] = at.split(",").map(Number)
  return { west, south, east, north }
}

test("a click on the city overview lands on the street, its buildings drawn", async ({
  page,
  isMobile,
}) => {
  await page.goto(`${stockholm}?at=${overviewAt}`)
  await mapDrawn(page)
  await mapOf(page).scrollIntoViewIfNeeded()
  const box = (await mapOf(page).boundingBox()) as {
    width: number
    height: number
  }
  const position = { x: box.width / 2, y: box.height / 2 }
  if (isMobile) {
    await mapOf(page).tap({ position })
  } else {
    await mapOf(page).click({ position })
  }

  await expect
    .poll(() => groundWidth(areaIn(page)))
    .toBeLessThan(streetLevelWidth)
  await streetDrawn(page)
  // The guide's pulse sits on a building with results, read from the tiles
  await expect(
    streetPulse(page)
      .getByText(isMobile ? "Tap a building" : "Click a building")
      .filter({ visible: true })
  ).toBeVisible()
})

test("Tab goes through the buildings nearest the centre, and Enter selects one", async ({
  page,
}) => {
  await page.goto(`${stockholm}?at=${streetAt}`)
  await mapDrawn(page)
  await streetDrawn(page)
  // The street's buildings are known once the pulse sits on one
  await expect(streetPulse(page)).toHaveCount(1)

  await mapOf(page).focus()
  await page.keyboard.press("Tab")
  await expect(mapOf(page)).toBeFocused()
  await expect(liveRegion(page)).toHaveText(
    "Building 1 of 12 near the centre: 1 of 3 rules met"
  )
  await page.keyboard.press("Tab")
  await expect(liveRegion(page)).toHaveText(
    /^Building 2 of 12 near the centre:/
  )
  await page.keyboard.press("Shift+Tab")
  await expect(liveRegion(page)).toHaveText(
    /^Building 1 of 12 near the centre:/
  )

  await page.keyboard.press("Enter")
  await expect
    .poll(() => new URL(page.url()).searchParams.get("building"))
    .toBe("4176")
  // The building's rule switcher shows in the panel
  await expect(page.getByRole("radiogroup")).toHaveCount(1)
})

test("moving the map starts the buildings again from the new centre, and Tab leaves after the last", async ({
  page,
}) => {
  await page.goto(`${stockholm}?at=${streetAt}`)
  await mapDrawn(page)
  await streetDrawn(page)
  await expect(streetPulse(page)).toHaveCount(1)

  await mapOf(page).focus()
  await page.keyboard.press("Tab")
  await page.keyboard.press("Tab")
  await expect(liveRegion(page)).toHaveText(
    /^Building 2 of 12 near the centre:/
  )
  const before = areaIn(page)
  await page.keyboard.press("ArrowRight")
  await expect.poll(() => areaIn(page).west).not.toBe(before.west)
  await page.keyboard.press("Tab")
  await expect(liveRegion(page)).toHaveText(
    /^Building 1 of 12 near the centre:/
  )

  for (let presses = 1; presses < 12; presses += 1) {
    await page.keyboard.press("Tab")
  }
  await expect(liveRegion(page)).toHaveText(
    /^Building 12 of 12 near the centre:/
  )
  await page.keyboard.press("Tab")
  await expect(mapOf(page)).not.toBeFocused()
})

test(
  "the street arrives where the overview is clicked, then rests",
  { tag: "@motion" },
  async ({ page, isMobile }) => {
    await page.goto(`${stockholm}?at=${overviewAt}`)
    await mapDrawn(page)
    await mapOf(page).scrollIntoViewIfNeeded()
    await watchArrival(page)
    const box = (await mapOf(page).boundingBox()) as {
      width: number
      height: number
    }
    const position = { x: box.width / 2, y: box.height / 2 }
    if (isMobile) {
      await mapOf(page).tap({ position })
    } else {
      await mapOf(page).click({ position })
    }

    await arrived(page)
    await expect(streetPulse(page)).toHaveCount(1)
  }
)

// With motion, one test at a time: on Chrome's software renderer, the first
// frames of the street hold the next ones back for seconds (its shaders are
// made as they are first drawn), and more so when tests run side by side;
// the camera moves, and the pulse leaves the page, on the next frames
test(
  "the guide's pulse leaves the street as soon as the map moves",
  { tag: "@motion" },
  async ({ page, isMobile }) => {
    await page.goto(`${stockholm}?at=${overviewAt}`)
    await mapDrawn(page)
    await mapOf(page).scrollIntoViewIfNeeded()
    await watchArrival(page)
    const box = (await mapOf(page).boundingBox()) as {
      width: number
      height: number
    }
    const position = { x: box.width / 2, y: box.height / 2 }
    if (isMobile) {
      await mapOf(page).tap({ position })
    } else {
      await mapOf(page).click({ position })
    }
    await arrived(page)
    await expect(streetPulse(page)).toHaveCount(1)

    const before = areaIn(page)
    await mapOf(page).focus()
    await page.keyboard.press("ArrowDown")
    await expect.poll(() => areaIn(page).south).not.toBe(before.south)
    await expect(streetPulse(page)).toHaveCount(0)
  }
)
