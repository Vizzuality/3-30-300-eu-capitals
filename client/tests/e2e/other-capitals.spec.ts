import { expect, test, type Locator, type Page } from "@playwright/test"

/*
 * Moving on from a capital's page: "All capitals" and "All 27" go back to
 * the ranking on Home, and the rows of Other capitals open the capitals
 * ranked around this one, clicked or tapped, or reached with Tab and opened
 * with Enter. The first and the last capital show the two closest.
 */

async function hydrated(page: Page) {
  await expect(page.locator("[data-map-area]")).toHaveAttribute(
    "data-instance",
    /.+/
  )
}

async function press(target: Locator, isMobile: boolean) {
  await target.scrollIntoViewIfNeeded()
  if (isMobile) {
    await target.tap()
  } else {
    await target.click()
  }
}

/** Presses Tab until `target` has the focus, as a keyboard user would */
async function tabTo(page: Page, target: Locator) {
  for (let presses = 0; presses < 40; presses++) {
    await page.keyboard.press("Tab")
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      return
    }
  }
  throw new Error("Tab never reached the element")
}

/** The rows of Other capitals, as screen readers name them */
const otherCapitals = (page: Page) =>
  page
    .getByRole("listitem")
    .filter({ has: page.locator("[data-slug]") })
    .getByText(/^[^,]+, rank \d+:/)

const row = (page: Page, capital: string, rank: number) =>
  page.getByRole("link", { name: new RegExp(`^${capital}, rank ${rank}:`) })

/** The capital's page has replaced the one before */
async function expectCapital(page: Page, slug: string, name: string) {
  await expect(page).toHaveURL(`/en/capitals/${slug}`)
  await expect(
    page.getByRole("heading", { level: 1, name, exact: true })
  ).toBeVisible()
}

/** Home is shown, on the ranking, and the capital has gone */
async function expectRanking(page: Page) {
  await expect(page).toHaveURL("/en")
  await expect(
    page.getByRole("heading", { level: 1, name: "How green is your capital?" })
  ).toBeVisible()
  await expect(page.getByRole("tab", { name: "Ranking" })).toHaveAttribute(
    "aria-selected",
    "true"
  )
  await expect(
    page.getByRole("heading", { level: 2, name: "Helsinki leads the way." })
  ).toBeVisible()
}

test("“All capitals” goes back to the ranking, from the A–Z list", async ({
  page,
  isMobile,
}) => {
  await page.goto("/en?tab=az")
  await hydrated(page)

  await press(page.getByRole("link", { name: "Copenhagen, Denmark" }), isMobile)
  await expectCapital(page, "copenhagen", "Copenhagen")
  await expect(
    page.getByText("Denmark · about 660,000 residents")
  ).toBeVisible()

  await press(page.getByRole("link", { name: "All capitals" }), isMobile)
  await expectRanking(page)
})

test("“All 27” goes back to the ranking", async ({ page, isMobile }) => {
  await page.goto("/en/capitals/stockholm")
  await hydrated(page)

  await press(
    page.getByRole("link", { name: "All 27 capitals, in the ranking" }),
    isMobile
  )
  await expectRanking(page)
})

test("a capital opens from Other capitals, without the building", async ({
  page,
  isMobile,
}) => {
  await page.goto("/en/capitals/stockholm?building=31947&rule=30")
  await hydrated(page)

  // Stockholm, between the capitals ranked just above and just below it
  await expect(otherCapitals(page)).toHaveText([
    /^Paris, rank 16:/,
    /^Stockholm, rank 17:/,
    /^Brussels, rank 18:/,
  ])
  // Its own row is not a link
  await expect(row(page, "Stockholm", 17)).toHaveCount(0)

  await press(row(page, "Paris", 16), isMobile)
  await expectCapital(page, "paris", "Paris")

  // Paris, in turn, between its own neighbours
  await expect(otherCapitals(page)).toHaveText([
    /^Luxembourg, rank 15:/,
    /^Paris, rank 16:/,
    /^Stockholm, rank 17:/,
  ])
})

test("a capital opens from Other capitals with the keyboard alone", async ({
  page,
}) => {
  await page.goto("/en/capitals/stockholm")
  await hydrated(page)

  // Tab passes the first row, then the capital's own, to the last
  await tabTo(page, row(page, "Paris", 16))
  await page.keyboard.press("Tab")
  await expect(row(page, "Brussels", 18)).toBeFocused()
  await page.keyboard.press("Enter")

  await expectCapital(page, "brussels", "Brussels")
})

test("the first and the last capital show the two closest", async ({
  page,
  isMobile,
}) => {
  await page.goto("/en/capitals/helsinki")
  await hydrated(page)
  await expect(otherCapitals(page)).toHaveText([
    /^Helsinki, rank 1:/,
    /^Berlin, rank 2:/,
    /^Nicosia, rank 3:/,
  ])

  await press(row(page, "Nicosia", 3), isMobile)
  await expectCapital(page, "nicosia", "Nicosia")

  await page.goto("/en/capitals/valletta")
  await hydrated(page)
  await expect(otherCapitals(page)).toHaveText([
    /^Athens, rank 25:/,
    /^Lisbon, rank 26:/,
    /^Valletta, rank 27:/,
  ])

  await press(row(page, "Athens", 25), isMobile)
  await expectCapital(page, "athens", "Athens")
})

/**
 * Whether the capital's own row is drawn over the highlight resting on it:
 * the topmost thing at the centre of its name is the name, not the
 * highlight. The highlight never takes the pointer, so for this check only
 * it is made to.
 */
async function ownRowOnTop(page: Page, slug: string) {
  return page.evaluate((capital) => {
    const own = document.querySelector<HTMLElement>(
      `main [aria-current='page'][data-slug='${capital}']`
    )
    const highlight = own
      ?.closest("[data-slot='other-capitals']")
      ?.querySelector<HTMLElement>("[data-slot='row-highlight']")
    const name = own?.querySelector("span.flex-1")
    if (!own || !highlight || !name) {
      return false
    }
    const box = name.getBoundingClientRect()
    const layers = [
      highlight,
      ...highlight.querySelectorAll("*"),
    ] as Array<HTMLElement>
    for (const layer of layers) {
      layer.style.pointerEvents = "auto"
    }
    const top = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2
    )
    for (const layer of layers) {
      layer.style.pointerEvents = ""
    }
    return top !== null && name.contains(top)
  }, slug)
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`the capital's own row shows over its highlight, ${colorScheme}`, async ({
    page,
    isMobile,
  }) => {
    await page.emulateMedia({ colorScheme })

    for (const slug of ["helsinki", "stockholm", "valletta"]) {
      await page.goto(`/en/capitals/${slug}`)
      await hydrated(page)
      const own = page.locator(
        `main [aria-current='page'][data-slug='${slug}']`
      )
      await own.scrollIntoViewIfNeeded()
      await expect.poll(() => ownRowOnTop(page, slug)).toBe(true)

      // The highlight follows the pointer to another row, then comes back
      if (!isMobile) {
        const other = page
          .locator("main [data-slot='other-capitals'] a[data-slug]")
          .first()
        await other.hover()
        await page.mouse.move(0, 0)
        await expect.poll(() => ownRowOnTop(page, slug)).toBe(true)
      }
    }
  })
}
