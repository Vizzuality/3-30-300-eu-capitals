import { expect, test, type Locator, type Page } from "@playwright/test"

import { hydrated } from "./page-ready"
import { slowAnimations } from "./slow-animations"

/*
 * Each row of the ranking on Home opens its capital: clicked or tapped, or
 * reached with Tab and opened with Enter.
 */

const row = (page: Page, capital: string, rank: number) =>
  page.getByRole("link", { name: new RegExp(`^${capital}, rank ${rank}:`) })

/** Presses Tab until `target` has the focus, as a keyboard user would */
async function tabTo(page: Page, target: Locator) {
  for (let presses = 0; presses < 60; presses++) {
    await page.keyboard.press("Tab")
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      return
    }
  }
  throw new Error("Tab never reached the element")
}

async function expectCapital(page: Page, slug: string, name: string) {
  await expect(page).toHaveURL(`/en/capitals/${slug}`)
  await expect(
    page.getByRole("heading", { level: 1, name, exact: true })
  ).toBeVisible()
}

test("a capital opens from its row in the ranking", async ({
  page,
  isMobile,
}) => {
  await page.goto("/en")
  await hydrated(page)

  // The rows are in the order of the ranking, the leader first
  await expect(
    page.getByRole("heading", { level: 2, name: "Helsinki leads the way." })
  ).toBeVisible()
  const stockholm = row(page, "Stockholm", 17)
  await stockholm.scrollIntoViewIfNeeded()
  if (isMobile) {
    await stockholm.tap()
  } else {
    await stockholm.click()
  }

  await expectCapital(page, "stockholm", "Stockholm")
})

test("a capital opens from its row with the keyboard alone", async ({
  page,
}) => {
  await page.goto("/en")
  await hydrated(page)

  // Tab reaches the rows after the guide, the first row first
  await tabTo(page, row(page, "Helsinki", 1))
  await page.keyboard.press("Tab")
  await expect(row(page, "Berlin", 2)).toBeFocused()
  await page.keyboard.press("Enter")

  await expectCapital(page, "berlin", "Berlin")
})

test(
  "the leaving page fades out where it was, from a scrolled panel",
  { tag: "@motion" },
  async ({ page, isMobile }) => {
    await page.goto("/en")
    await hydrated(page)

    // Scrolled down to a low row of the ranking
    const lisbon = row(page, "Lisbon", 26)
    await lisbon.scrollIntoViewIfNeeded()
    const before = await lisbon.boundingBox()
    if (!before) {
      throw new Error("The row is not on screen")
    }

    // The fade played ten times slower, so that frames of it are seen even
    // when the new page takes long to render
    await slowAnimations(page)

    // Each frame of the fade, where the leaving copy of the row is on screen,
    // from the click until the copy has come and faded out, however long the
    // new page takes to render
    await page.evaluate(() => {
      const fade = { frames: [] as Array<number>, done: false }
      Object.assign(window, { copyFade: fade })
      let seen = false
      const record = () => {
        const copy = document.querySelector("[inert] [data-slug='lisbon']")
        // Seen while the copy shows at all: it is taken out once faded out
        const fading = copy?.closest("[inert]")
        if (copy && fading && Number(getComputedStyle(fading).opacity) > 0) {
          seen = true
          const box = copy.getBoundingClientRect()
          fade.frames.push(box.top + box.height / 2)
        } else if (seen) {
          fade.done = true
          return
        }
        requestAnimationFrame(record)
      }
      addEventListener("click", () => requestAnimationFrame(record), {
        capture: true,
        once: true,
      })
    })
    if (isMobile) {
      await lisbon.tap()
    } else {
      await lisbon.click()
    }
    await expect(page).toHaveURL("/en/capitals/lisbon")

    type CopyFade = { frames: Array<number>; done: boolean }
    const copyFade = () =>
      page.evaluate(
        () => (window as unknown as { copyFade: CopyFade }).copyFade
      )
    // Meanwhile the map flies to the capital, drawn by Chrome's software
    // renderer, which slows the page while other tests run alongside
    await expect
      .poll(async () => (await copyFade()).done, { timeout: 15_000 })
      .toBe(true)
    const { frames } = await copyFade()
    expect(frames.length).toBeGreaterThan(0)
    for (const y of frames) {
      expect(y).toBeCloseTo(before.y + before.height / 2, 0)
    }

    // The new page starts at the top
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.scrollY + (document.getElementById("main")?.scrollTop ?? 0)
        )
      )
      .toBe(0)
  }
)
