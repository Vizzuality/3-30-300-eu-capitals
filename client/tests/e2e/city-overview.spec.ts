import { expect, test, type Page } from "@playwright/test"

import { colors } from "@/design/tokens"
import { fitArea, viewportOf } from "@/map/camera"
import { groundWidth, streetLevelWidth } from "@/lib/visible-area"
import stockholmSummary from "@fixtures/release/capitals/stockholm/summary.json" with { type: "json" }

/*
 * A capital's city overview: its 10 m grid coloured by the rules met, in
 * both themes; the guide's pulse, which leaves once the visitor moves the
 * map; a click or a tap zooming in to the street where it lands, and Enter
 * zooming in at the centre of the view.
 */

type Area = { west: number; south: number; east: number; north: number }

const stockholm = "/en/capitals/stockholm"
// Central Stockholm, about 9 km across: the city overview
const central: Area = { west: 17.98, south: 59.3, east: 18.14, north: 59.36 }
const centralAt = "17.98,59.3,18.14,59.36"

const mapOf = (page: Page) => page.getByRole("application")
const pulseTag = (page: Page) => page.locator("[data-pulse-tag]")

/** Waits for the map to be drawn */
async function mapDrawn(page: Page) {
  const deck = page.locator("[data-deck-instance]")
  await expect(deck).toHaveAttribute("data-drawing", "true", {
    timeout: 15_000,
  })
  await expect(deck).toHaveAttribute("data-frames", /^[1-9]/)
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
  return areaIn(page) as Area
}

const centreOf = (area: Area) => [
  (area.west + area.east) / 2,
  (area.south + area.north) / 2,
]

/** The guide's sentence for the street, with a mouse or a finger */
const streetGuide = (page: Page) =>
  page
    .getByText(/(Click|Tap) a building to see why it scores as it does/)
    .filter({ visible: true })

test("a click or a tap on the city overview zooms in to the street there", async ({
  page,
  isMobile,
}) => {
  await page.goto(`${stockholm}?at=${centralAt}`)
  await mapDrawn(page)
  await mapOf(page).scrollIntoViewIfNeeded()
  const box = (await mapOf(page).boundingBox()) as {
    width: number
    height: number
  }
  const size = { width: box.width, height: box.height }
  // A place right of and above the centre, where the shared area put it
  const position = { x: size.width / 2 + 60, y: size.height / 2 - 40 }
  const [longitude, latitude] = viewportOf(
    fitArea(central, size),
    size
  ).unproject([position.x, position.y])

  if (isMobile) {
    await mapOf(page).tap({ position })
  } else {
    await mapOf(page).click({ position })
  }

  const street = await nextArea(page, central)
  expect(groundWidth(street)).toBeLessThan(streetLevelWidth)
  const [x, y] = centreOf(street)
  expect(x).toBeCloseTo(longitude, 4)
  expect(y).toBeCloseTo(latitude, 4)
  await expect(streetGuide(page)).toBeVisible()
  // The overview's pulse leaves
  await expect(page.locator('[data-pulse-tag="overview"]')).toHaveCount(0)
})

test("Enter zooms in to the street at the centre of the view", async ({
  page,
}) => {
  await page.goto(`${stockholm}?at=${centralAt}`)
  await mapDrawn(page)
  const box = (await mapOf(page).boundingBox()) as {
    width: number
    height: number
  }
  const [longitude, latitude] = centreOf(central)
  const fitted = fitArea(central, { width: box.width, height: box.height })

  await mapOf(page).focus()
  await page.keyboard.press("Enter")

  const street = await nextArea(page, central)
  expect(groundWidth(street)).toBeLessThan(streetLevelWidth)
  const [x, y] = centreOf(street)
  expect(x).toBeCloseTo(fitted.longitude, 4)
  expect(y).toBeCloseTo(fitted.latitude, 4)
  // The shared area's centre, which the camera fitted
  expect(x).toBeCloseTo(longitude, 2)
  expect(y).toBeCloseTo(latitude, 2)
  await expect(streetGuide(page)).toBeVisible()
  await expect(page.locator("[data-map] output.sr-only")).toHaveText(
    "Street level"
  )
})

test("the guide's pulse waits on the city overview until the map is moved", async ({
  page,
  isMobile,
}) => {
  await page.goto(stockholm)
  await mapDrawn(page)
  await expect(
    pulseTag(page)
      .getByText(isMobile ? "Tap to zoom in" : "Click to zoom in")
      .filter({ visible: true })
  ).toBeVisible()

  await mapOf(page).focus()
  await page.keyboard.press("ArrowRight")
  await expect(pulseTag(page)).toHaveCount(0)
  // Still the city overview
  await nextArea(page, undefined)
  await expect(
    page
      .getByText(/(Click|Tap) anywhere on the map to zoom in on a street/)
      .filter({ visible: true })
  ).toBeVisible()
})

test("zooming out and panning stop at the edge of the city's map", async ({
  page,
}) => {
  const [west, south, east, north] = stockholmSummary.context.bbox
  await page.goto(stockholm)
  await mapDrawn(page)

  await mapOf(page).focus()
  // Far more than the map allows: out, then towards the north-east
  for (const key of ["-", "-", "-", "-", "-"]) {
    await page.keyboard.press(key)
  }
  const out = await nextArea(page, undefined)
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press("ArrowRight")
    await page.keyboard.press("ArrowUp")
  }
  const panned = await nextArea(page, out)

  // Rounded in the address to what a pixel needs
  const hair = 0.001
  for (const area of [out, panned]) {
    expect(area.west).toBeGreaterThanOrEqual(west - hair)
    expect(area.south).toBeGreaterThanOrEqual(south - hair)
    expect(area.east).toBeLessThanOrEqual(east + hair)
    expect(area.north).toBeLessThanOrEqual(north + hair)
  }
  // Against the north-east corner
  expect(panned.east).toBeCloseTo(east, 2)
  expect(panned.north).toBeCloseTo(north, 2)
})

/**
 * How many pixels of the map are in each of these colours exactly, and how
 * many are magenta (a value the grid does not know)
 */
async function colourCounts(page: Page, wanted: Array<string>) {
  const shot = await mapOf(page).screenshot()
  return page.evaluate(
    async ([data, hexes]) => {
      const image = new Image()
      image.src = `data:image/png;base64,${data}`
      await image.decode()
      const canvas = document.createElement("canvas")
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext("2d") as CanvasRenderingContext2D
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, image.width, image.height).data
      const keys = [...hexes, "#ff00ff"].map((hex) =>
        [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join()
      )
      const counts = keys.map(() => 0)
      for (let at = 0; at < pixels.length; at += 4) {
        const index = keys.indexOf(
          `${pixels[at]},${pixels[at + 1]},${pixels[at + 2]}`
        )
        if (index >= 0) {
          counts[index] += 1
        }
      }
      return { results: counts.slice(0, -1), magenta: counts.at(-1) }
    },
    [shot.toString("base64"), wanted] as const
  )
}

for (const scheme of ["light", "dark"] as const) {
  test(`Stockholm's overview colours each square by the rules met, ${scheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto(`${stockholm}?at=${centralAt}`)
    await mapDrawn(page)
    await mapOf(page).scrollIntoViewIfNeeded()

    const results = [
      colors.result0,
      colors.result1,
      colors.result2,
      colors.result3,
    ].map((color) => color[scheme])
    // Once the grid's tiles are drawn, every result colour shows, and no
    // value the grid does not know
    await expect
      .poll(async () => {
        const counts = await colourCounts(page, results)
        return counts.magenta === 0 && counts.results.every((n) => n > 500)
      })
      .toBe(true)
  })
}
