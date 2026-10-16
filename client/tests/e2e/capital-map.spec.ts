import { expect, test, type Page } from "@playwright/test"

import { colors } from "@/design/tokens"
import { hydrated } from "./page-ready"

/*
 * A capital's page shows the whole city: once the camera has settled, the
 * city's outline lies inside the map, clear of what floats over it (the
 * controls, the attribution, and on phones the band's fade), on desktop and
 * on the phone's band, for the largest cities too.
 */

const mapOf = (page: Page) => page.getByRole("application")

type Box = { left: number; top: number; right: number; bottom: number }

/**
 * Where the city is drawn on the map: the box of its pixels in the Land
 * colour (nothing else on a capital's map has it yet), in pixels from the
 * map's top left corner
 */
async function cityBox(page: Page): Promise<Box | null> {
  const shot = await mapOf(page).screenshot()
  return page.evaluate(
    async ([data, land]) => {
      const image = new Image()
      image.src = `data:image/png;base64,${data}`
      await image.decode()
      const canvas = document.createElement("canvas")
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext("2d") as CanvasRenderingContext2D
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, image.width, image.height).data
      const [r, g, b] = [1, 3, 5].map((at) =>
        Number.parseInt(land.slice(at, at + 2), 16)
      )
      const box = { left: Infinity, top: Infinity, right: -1, bottom: -1 }
      for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
          const at = (y * image.width + x) * 4
          if (
            pixels[at] === r &&
            pixels[at + 1] === g &&
            pixels[at + 2] === b
          ) {
            box.left = Math.min(box.left, x)
            box.top = Math.min(box.top, y)
            box.right = Math.max(box.right, x)
            box.bottom = Math.max(box.bottom, y)
          }
        }
      }
      // In CSS pixels
      const ratio = window.devicePixelRatio
      return box.right < 0
        ? null
        : {
            left: box.left / ratio,
            top: box.top / ratio,
            right: (box.right + 1) / ratio,
            bottom: (box.bottom + 1) / ratio,
          }
    },
    [shot.toString("base64"), colors.land.light] as const
  )
}

/** The city's box once the camera has settled: the same twice in a row */
async function settledCityBox(page: Page) {
  let last = ""
  await expect
    .poll(async () => {
      const box = JSON.stringify(await cityBox(page))
      const settled = box !== "null" && box === last
      last = box
      return settled
    })
    .toBe(true)
  return JSON.parse(last) as Box
}

/** The boxes of what floats over the map, from its top left corner */
function overlays(page: Page) {
  return mapOf(page).evaluate((map) => {
    const origin = map.getBoundingClientRect()
    const root = map.closest("[data-map]") as HTMLElement
    return [...root.querySelectorAll("button"), ...root.querySelectorAll("a")]
      .filter((element) => element.offsetParent !== null)
      .map((element) => {
        const box = element.getBoundingClientRect()
        return {
          left: box.left - origin.left,
          top: box.top - origin.top,
          right: box.right - origin.left,
          bottom: box.bottom - origin.top,
        }
      })
  })
}

for (const slug of ["rome", "sofia", "berlin", "valletta"]) {
  test(`${slug}'s page shows the whole city, clear of the overlays`, async ({
    page,
    isMobile,
  }) => {
    await page.emulateMedia({ colorScheme: "light" })
    await page.goto(`/en/capitals/${slug}`)
    await hydrated(page)
    await mapOf(page).scrollIntoViewIfNeeded()

    const city = await settledCityBox(page)
    const map = (await mapOf(page).boundingBox()) as {
      width: number
      height: number
    }
    // The band's fade into the page, at its bottom
    const visibleBottom = map.height - (isMobile ? 48 : 0)

    expect(city.left).toBeGreaterThanOrEqual(1)
    expect(city.top).toBeGreaterThanOrEqual(1)
    expect(city.right).toBeLessThanOrEqual(map.width - 1)
    expect(city.bottom).toBeLessThanOrEqual(visibleBottom - 1)
    // Nothing that floats over the map overlaps the city's box
    for (const overlay of await overlays(page)) {
      const apart =
        overlay.right <= city.left ||
        overlay.left >= city.right ||
        overlay.bottom <= city.top ||
        overlay.top >= city.bottom
      expect(apart).toBe(true)
    }
  })
}
