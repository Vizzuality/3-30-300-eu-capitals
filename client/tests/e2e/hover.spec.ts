import { expect, test, type Locator, type Page } from "@playwright/test"

/*
 * A control rises 2 px under the pointer (Lift) and drops back when the
 * pointer leaves. Wherever the pointer rests, on the control, on its very
 * edge or just past it, the control rises at most once and then keeps still:
 * it never rises and drops over and over under a resting pointer.
 */

async function hydrated(page: Page) {
  await expect(page.locator("[data-map-area]")).toHaveAttribute(
    "data-instance",
    /.+/
  )
}

type Point = readonly [x: number, y: number]

/** The control's rise, in pixels, read from its computed transform */
function rise(control: Locator) {
  return control.evaluate(
    (element) => -new DOMMatrix(getComputedStyle(element).transform).f
  )
}

/** How many times the control starts rising, in a series of rises */
function risesStarted(rises: Array<number>) {
  let started = 0
  let goingUp = false
  for (let index = 1; index < rises.length; index++) {
    const step = rises[index] - rises[index - 1]
    if (step > 0.15 && !goingUp) {
      started++
    }
    if (Math.abs(step) > 0.15) {
      goingUp = step > 0
    }
  }
  return started
}

/**
 * Rests the pointer at a point for 1.6 s, trembling a quarter of a pixel
 * along the edge it is near (`along`), as a hand does, so the browser keeps
 * checking what is under it. The control may rise once, never again. Returns
 * its last rise.
 */
async function restPointer(
  page: Page,
  control: Locator,
  [x, y]: Point,
  along: "x" | "y" = "x"
) {
  const rises: Array<number> = []
  for (let sample = 0; sample < 40; sample++) {
    const tremble = sample % 2 ? 0.25 : -0.25
    await page.mouse.move(
      along === "x" ? x + tremble : x,
      along === "y" ? y + tremble : y
    )
    rises.push(await rise(control))
    await page.waitForTimeout(40)
  }
  expect(
    risesStarted(rises),
    `at ${x}, ${y}: ${rises.map((value) => value.toFixed(2)).join(" ")}`
  ).toBeLessThanOrEqual(1)
  return rises.at(-1) ?? 0
}

test(
  "the top bar's links keep still under a resting pointer, at their edges too",
  { tag: "@motion" },
  async ({ page, isMobile }) => {
    // Fingers do not hover
    test.skip(isMobile, "Hover needs a mouse")
    // Sixteen points, each watched for over a second
    test.setTimeout(60_000)
    await page.goto("/en")
    await hydrated(page)

    const banner = page.getByRole("banner")
    for (const control of [
      banner.getByRole("link", { name: "About", exact: true }),
      banner.getByRole("link", { name: "3-30-300, back to Home" }),
    ]) {
      const box = await control.boundingBox()
      if (!box) {
        throw new Error("The link is not on screen")
      }
      const [left, top] = [box.x, box.y]
      const [right, bottom] = [box.x + box.width, box.y + box.height]
      const [middleX, middleY] = [left + box.width / 2, top + box.height / 2]
      const away = async () => {
        await page.mouse.move(5, 795)
        await page.waitForTimeout(600)
      }
      const onIt = async () => {
        await page.mouse.move(middleX, middleY)
        await page.waitForTimeout(600)
      }

      // 1 px inside each edge, coming from elsewhere: it rises and stays up
      for (const [point, along] of [
        [[middleX, top + 1], "x"],
        [[middleX, bottom - 1], "x"],
        [[left + 1, middleY], "y"],
        [[right - 1, middleY], "y"],
      ] as const) {
        await away()
        expect(
          await restPointer(page, control, point, along),
          `at ${point}`
        ).toBe(2)
      }

      // On the pixels just past each edge, coming from the risen link
      for (const [point, along] of [
        [[middleX, bottom], "x"],
        [[middleX, top - 1], "x"],
        [[left - 1, middleY], "y"],
        [[right, middleY], "y"],
      ] as const) {
        await onIt()
        await restPointer(page, control, point, along)
      }
    }
  }
)
