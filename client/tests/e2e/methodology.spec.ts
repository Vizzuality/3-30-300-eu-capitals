import { expect, test, type Page } from "@playwright/test"

import { southern } from "./buildings"
import { hydrated, selectionDrawn } from "./page-ready"

/*
 * The Methodology page, opened from the top bar, and its sections reached
 * from its table of contents, with the mouse and with the keyboard: the
 * address names the section, the section starts at the top of the reading
 * page with its own top spacing only (nothing of the section before it shows
 * above), it is highlighted in the table of contents, and focus is on it, so
 * the next Tab continues from there. With motion, the page glides there, and
 * the highlight goes straight to the section, not through those passed.
 *
 * Its back link leads to the page it was opened from, as About's does: back
 * through the history to the page as it was left; opened directly, to Home.
 */

const sections = [
  { name: "3 trees in view", id: "trees" },
  { name: "30% canopy around", id: "canopy" },
  { name: "300 m to a park", id: "park" },
  { name: "Residents", id: "residents" },
  { name: "City limits", id: "city-limits" },
  { name: "Data", id: "data" },
  { name: "Limits", id: "limits" },
]

const contents = (page: Page) =>
  page.getByRole("navigation", { name: "On this page" })

const contentsLink = (page: Page, name: string) =>
  contents(page).getByRole("link", { name, exact: true })

const section = (page: Page, name: string) =>
  page.locator("section", {
    has: page.getByRole("heading", { level: 2, name, exact: true }),
  })

/**
 * Where a section is, in pixels from the top of the reading page (the
 * window on phones): whether its top is where its scroll margin puts it,
 * and whether what comes before it shows (the section before, or the
 * panel's content above the reading page on phones)
 */
function placeOf(page: Page, id: string) {
  return page.evaluate((target) => {
    const element = document.getElementById(target) as HTMLElement
    const article = element.closest("article") as HTMLElement
    const scrollsOnItsOwn = getComputedStyle(article).overflowY === "auto"
    const top = scrollsOnItsOwn ? article.getBoundingClientRect().top : 0
    const before =
      element.previousElementSibling ??
      (scrollsOnItsOwn ? null : article.previousElementSibling)
    const margin = parseFloat(getComputedStyle(element).scrollMarginTop)
    return {
      // Within a pixel: scroll positions can fall between pixels
      atTop: Math.abs(element.getBoundingClientRect().top - top - margin) < 1,
      beforeShows: before
        ? before.getBoundingClientRect().bottom - top > 0
        : false,
    }
  }, id)
}

/** The section is at the top of the reading page, alone */
async function expectAtTop(page: Page, id: string) {
  await expect
    .poll(() => placeOf(page, id))
    .toEqual({ atTop: true, beforeShows: false })
}

async function expectReached(page: Page, { name, id }: (typeof sections)[0]) {
  await expect(page).toHaveURL(`/en/methodology#${id}`)
  await expectAtTop(page, id)
  await expect(section(page, name)).toBeFocused()
  await expect(contentsLink(page, name)).toHaveAttribute(
    "aria-current",
    "location"
  )
}

test("each section reached from the table of contents", async ({ page }) => {
  await page.goto("/en")
  await hydrated(page)

  await page
    .getByRole("navigation", { name: "Site" })
    .getByRole("link", { name: "Methodology" })
    .click()
  await expect(page).toHaveURL("/en/methodology")
  await expect(
    page.getByRole("heading", { level: 1, name: "How we checked every home" })
  ).toBeVisible()
  // Once the leaving page has faded out
  await expect(page.locator("main [inert]")).toHaveCount(0)

  for (const target of sections) {
    await contentsLink(page, target.name).click()
    await expectReached(page, target)
  }
})

test("each section reached from the table of contents with the keyboard", async ({
  page,
}) => {
  await page.goto("/en/methodology")
  await hydrated(page)

  for (const target of sections) {
    await contentsLink(page, target.name).focus()
    await page.keyboard.press("Enter")
    await expectReached(page, target)
  }

  // The next Tab continues in the section reached
  await contentsLink(page, "Limits").focus()
  await page.keyboard.press("Enter")
  await expect(section(page, "Limits")).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(
    section(page, "Limits").getByRole("link", {
      name: "Bertassello et al. (2026)",
    })
  ).toBeFocused()
})

test("a section opened directly by its address", async ({ page }) => {
  await page.goto("/en/methodology#limits")
  await hydrated(page)

  await expectAtTop(page, "limits")
  await expect(contentsLink(page, "Limits")).toHaveAttribute(
    "aria-current",
    "location"
  )
})

test("the page glides to a section, highlighting only it @motion", async ({
  page,
}) => {
  await page.goto("/en/methodology")
  await hydrated(page)

  // Every frame, until the page rests: where it is scrolled to, and the
  // section highlighted
  await page.evaluate(() => {
    const frames: Array<{ top: number; current: string | null }> = []
    Object.assign(window, { glideFrames: frames })
    const article = document.querySelector("article") as HTMLElement
    const record = () => {
      frames.push({
        // The reading page scrolls on desktop, the window on phones
        top: Math.round(article.scrollTop + window.scrollY),
        current:
          document.querySelector("[aria-current=location]")?.textContent ??
          null,
      })
      requestAnimationFrame(record)
    }
    requestAnimationFrame(record)
  })

  await contentsLink(page, "Limits").click()
  await expectAtTop(page, "limits")

  const frames = await page.evaluate(
    () =>
      (
        window as unknown as {
          glideFrames: Array<{ top: number; current: string | null }>
        }
      ).glideFrames
  )
  // It moved through several positions before arriving, rather than jumping
  expect(new Set(frames.map(({ top }) => top)).size).toBeGreaterThan(3)
  // The highlight went from the first section straight to the last
  expect(new Set(frames.map(({ current }) => current))).toEqual(
    new Set(["13 trees in view", "7Limits"])
  )
})

async function expectPage(page: Page, path: string, heading: string) {
  await expect(page).toHaveURL(path)
  await expect(
    page.getByRole("heading", { level: 1, name: heading })
  ).toBeVisible()
  // Once the leaving page has faded out
  await expect(page.locator("main [inert]")).toHaveCount(0)
}

const siteLink = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Site" })
    .getByRole("link", { name, exact: true })

async function openMethodology(page: Page) {
  await siteLink(page, "Methodology").click()
  await expectPage(page, "/en/methodology", "How we checked every home")
}

const backLink = (page: Page, name = "Back to the map") =>
  page.getByRole("main").getByRole("link", { name })

test("Methodology opened from Home leads back to Home, on the tab left open", async ({
  page,
}) => {
  await page.goto("/en?tab=az")
  await hydrated(page)

  await openMethodology(page)
  await backLink(page).click()
  await expectPage(page, "/en?tab=az", "How green is your capital?")
  await expect(page.getByRole("tab", { name: "A–Z list" })).toHaveAttribute(
    "aria-selected",
    "true"
  )

  // The back link went back in the history: Methodology is the next entry
  await page.goForward()
  await expectPage(page, "/en/methodology", "How we checked every home")
  await expect(backLink(page)).toHaveAttribute("href", "/en?tab=az")
})

test("Methodology opened from a capital leads back to its building and rule", async ({
  page,
}) => {
  await page.goto(`${southern}&rule=30`)
  await hydrated(page)
  await selectionDrawn(page, "31947")

  await openMethodology(page)
  await backLink(page).click()
  await expectPage(page, `${southern}&rule=30`, "Stockholm")
  await expect(
    page.getByRole("radio", { name: "30 % canopy not met" })
  ).toBeChecked()
})

test("Methodology opened directly leads to Home", async ({ page }) => {
  await page.goto("/en/methodology")
  await hydrated(page)

  await backLink(page).click()
  await expectPage(page, "/en", "How green is your capital?")
})

test("the back link still goes back through the history after a jump to a section", async ({
  page,
}) => {
  await page.goto("/en?tab=az")
  await hydrated(page)

  await openMethodology(page)
  await contentsLink(page, "Data").click()
  await expect(page).toHaveURL("/en/methodology#data")
  await backLink(page).click()
  await expectPage(page, "/en?tab=az", "How green is your capital?")

  // The jump changed Methodology's address in place: it is the next entry
  await page.goForward()
  await expectPage(page, "/en/methodology#data", "How we checked every home")
})

test("About and Methodology opened from each other lead back through each page, also after a reload", async ({
  page,
}) => {
  await page.goto("/en?tab=az")
  await hydrated(page)

  // Home → About → Methodology → About
  await siteLink(page, "About").click()
  await expectPage(page, "/en/about", "About this site")
  await openMethodology(page)
  await siteLink(page, "About").click()
  await expectPage(page, "/en/about", "About this site")
  // The pages they were opened from are kept with their history entries
  await page.reload()
  await hydrated(page)

  // Then back, one page at a time, each named
  await backLink(page, "Back to Methodology").click()
  await expectPage(page, "/en/methodology", "How we checked every home")
  await backLink(page, "Back to About").click()
  await expectPage(page, "/en/about", "About this site")
  await backLink(page, "Back to the map").click()
  await expectPage(page, "/en?tab=az", "How green is your capital?")

  // It went back through the history all the way: the next entry is the
  // first About
  await page.goForward()
  await expectPage(page, "/en/about", "About this site")
  await expect(backLink(page)).toHaveAttribute("href", "/en?tab=az")
})

test("a page its back link opens without the history leads to Home", async ({
  page,
}) => {
  // About, opened from Methodology, then opened again from itself: its back
  // link is no longer the previous entry, so it opens Methodology anew
  await page.goto("/en/methodology")
  await hydrated(page)
  await siteLink(page, "About").click()
  await expectPage(page, "/en/about", "About this site")
  await siteLink(page, "About").click()
  await expectPage(page, "/en/about", "About this site")

  await backLink(page, "Back to Methodology").click()
  await expectPage(page, "/en/methodology", "How we checked every home")
  // Opened by a plain link, it has no page to go back to but Home, rather
  // than leading back to About and About back to it
  await expect(backLink(page)).toHaveAttribute("href", "/en")
})
