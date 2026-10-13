import { expect, test, type Page } from "@playwright/test"

/*
 * The Next step guide follows what the visitor does on a page and tells
 * screen readers each change, politely. A new page is announced by its name
 * alone: the guide that arrives with it stays quiet.
 */

const announcer = (page: Page) =>
  page.locator("[aria-live='polite']:not(main *)")
const guide = (page: Page) => page.locator("main [aria-atomic='true']")

/**
 * The guide shows its step label and its sentence: "Click" with a mouse,
 * "Tap" with a finger (the other wording is hidden)
 */
async function expectGuide(
  page: Page,
  isMobile: boolean,
  label: string,
  { click, tap }: { click: string; tap: string }
) {
  const region = guide(page)
  const [shown, hidden] = isMobile ? [tap, click] : [click, tap]
  await expect(region.getByText(label, { exact: true })).toBeVisible()
  await expect(region.getByText(shown, { exact: true })).toBeVisible()
  await expect(region.getByText(hidden, { exact: true })).toBeHidden()
}

async function hydrated(page: Page) {
  await expect(page.locator("[data-map-area]")).toHaveAttribute(
    "data-instance",
    /.+/
  )
}

/** The map is not there yet: the address changes as the map will change it */
async function goTo(page: Page, path: string) {
  await page.evaluate((to) => window.history.pushState({}, "", to), path)
}

/**
 * Records, for each guide added to the page from now on, whether its region
 * was already live when it arrived
 */
async function watchArrivingGuides(page: Page) {
  await page.evaluate(() => {
    const arrivals: Array<string | null> = []
    Object.assign(window, { guideArrivals: arrivals })
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && !node.closest("[inert]")) {
            const region = node.matches("[aria-atomic]")
              ? node
              : node.querySelector("[aria-atomic]")
            if (region) {
              arrivals.push(region.getAttribute("aria-live"))
            }
          }
        }
      }
    }).observe(document.querySelector("main") as Node, {
      childList: true,
      subtree: true,
    })
  })
}

test("the guide follows the visitor through a capital", async ({
  page,
  isMobile,
}) => {
  await page.goto("/en/capitals/stockholm")
  await hydrated(page)

  await expectGuide(page, isMobile, "Next · 1 of 3", {
    click: "Click anywhere on the map to zoom in on a street",
    tap: "Tap anywhere on the map to zoom in on a street",
  })
  // Once in place, the guide's region speaks when it changes
  await expect(guide(page)).toHaveAttribute("aria-live", "polite")

  // A building selected
  await goTo(page, "/en/capitals/stockholm?building=12")
  await expectGuide(page, isMobile, "Next · 3 of 3", {
    click:
      "Switch rules with 3 · 30 · 300, or click a facade to see the trees it sees",
    tap: "Switch rules with 3 · 30 · 300, or tap a facade to see the trees it sees",
  })

  // One of its facades
  await goTo(page, "/en/capitals/stockholm?building=12&facade=40")
  await expectGuide(page, isMobile, "Facade selected", {
    click: "Click the facade again to see the whole building",
    tap: "Tap the facade again to see the whole building",
  })

  // Another rule
  await goTo(page, "/en/capitals/stockholm?building=12&rule=30")
  await expectGuide(page, isMobile, "Explore", {
    click:
      "Click another building to compare it, or press Esc to go back to the street",
    tap: "Tap another building to compare it",
  })

  // Each change was told by the guide alone: the page did not change, so
  // its name was not announced again
  await expect(guide(page)).toHaveAttribute("aria-live", "polite")
  await expect(announcer(page)).toHaveText("")
})

// With motion for now: the announcement waits for the leaving page to fade
// out, and the reduced-motion version of that fade comes later
test(
  "a new page is announced by its name, and its guide stays quiet",
  { tag: "@motion" },
  async ({ page, isMobile }) => {
    await page.goto("/en/capitals/stockholm?building=12")
    await hydrated(page)
    await watchArrivingGuides(page)

    await page
      .getByRole("banner")
      .getByRole("link", { name: "3-30-300, back to Home" })
      .click()
    await expect(page).toHaveURL("/en")

    await expect(announcer(page)).toHaveText(
      "How green is your capital? The 3-30-300 rule in the 27 EU capitals"
    )
    await expectGuide(page, isMobile, "Start here", {
      click: "Click a capital on the map, or a row in the ranking",
      tap: "Tap a capital on the map, or a row in the ranking",
    })
    // Home's guide arrived silent, then became live for later changes
    expect(
      await page.evaluate(
        () => (window as unknown as { guideArrivals: unknown }).guideArrivals
      )
    ).toEqual([null])
    await expect(guide(page)).toHaveAttribute("aria-live", "polite")
  }
)

test("a shared link opens on the guide of its building", async ({
  page,
  isMobile,
}) => {
  const errors: Array<string> = []
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text())
    }
  })

  await page.goto("/en/capitals/stockholm?building=12&rule=300")
  await hydrated(page)

  await expectGuide(page, isMobile, "Explore", {
    click:
      "Click another building to compare it, or press Esc to go back to the street",
    tap: "Tap another building to compare it",
  })
  expect(errors).toEqual([])
})

/*
 * Nudge: every 3 s the guide's pointer taps (its scale leaves 1) and sends
 * out a ring, until the visitor acts; it is still under reduced motion
 */
// The guide of the page shown, not the leaving page's fading copy
const shownGuide = "main [data-guide-state]:not([inert] *)"
const pointer = (page: Page) =>
  page.locator(`${shownGuide} span[aria-hidden] > span.grid`)

/** The pointer's scale, read from its computed transform */
async function pointerScale(page: Page) {
  return pointer(page).evaluate(
    (element) => new DOMMatrix(getComputedStyle(element).transform).a
  )
}

/**
 * The pointer taps within 4 s of the page's clock (the first tap comes 0.8 s
 * after the guide is in place). The clock, installed before the page opens,
 * is paused and run a few frames at a time: as a page arrives, the software
 * renderer can hold frames back for longer than a tap lasts, and on the
 * page's own clock that tap would be skipped, never seen.
 */
async function expectNudging(page: Page) {
  // Paused just ahead of the page's clock, which runs on until then: again
  // if a held-back frame lets it pass that time first
  await expect(async () => {
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100))
  }).toPass()
  let scale = await pointerScale(page)
  for (
    let elapsed = 0;
    elapsed < 4_000 && Math.abs(scale - 1) < 0.005;
    elapsed += 50
  ) {
    await page.clock.runFor(50)
    scale = await pointerScale(page)
  }
  expect(scale).not.toBeCloseTo(1, 2)
}

test(
  "the guide nudges on a page opened directly",
  { tag: "@motion" },
  async ({ page }) => {
    await page.clock.install()
    await page.goto("/en")
    await hydrated(page)
    await expectNudging(page)
  }
)

test(
  "the guide nudges after moving to another page",
  { tag: "@motion" },
  async ({ page }) => {
    await page.clock.install()
    await page.goto("/en/capitals/stockholm")
    await hydrated(page)
    await page
      .getByRole("banner")
      .getByRole("link", { name: "3-30-300, back to Home" })
      .click()
    await expect(page).toHaveURL("/en")
    await expect(
      page.locator(`${shownGuide}[data-guide-state='home']`)
    ).toBeVisible()
    await expectNudging(page)
  }
)

test(
  "the guide nudges again from its next step",
  { tag: "@motion" },
  async ({ page }) => {
    await page.clock.install()
    await page.goto("/en/capitals/stockholm")
    await hydrated(page)
    await goTo(page, "/en/capitals/stockholm?building=12")
    await expect(
      page.locator("main [data-guide-state='building']")
    ).toBeVisible()
    await expectNudging(page)
  }
)

/** The pointer stays at rest over `duration` ms of the page's clock */
async function expectStill(page: Page, duration: number) {
  for (let elapsed = 0; elapsed < duration; elapsed += 250) {
    await page.clock.runFor(250)
    expect(await pointerScale(page)).toBe(1)
  }
  await expect(
    page.locator(`${shownGuide} span[aria-hidden] > span.absolute`)
  ).toHaveCount(0)
}

/*
 * The guide nudges three times (3 s apart, the first after 0.8 s), then
 * rests until its step changes. The page's clock is run forward, so the test
 * does not wait for it.
 */
test(
  "the guide nudges three times, then rests until its next step",
  { tag: "@motion" },
  async ({ page }) => {
    await page.clock.install()
    await page.goto("/en/capitals/stockholm")
    await hydrated(page)
    await expectNudging(page)

    // Past the third nudge: still
    await page.clock.runFor(10_000)
    await expectStill(page, 3_000)

    // A new step nudges three times again, then rests
    await goTo(page, "/en/capitals/stockholm?building=12")
    await expect(
      page.locator("main [data-guide-state='building']")
    ).toBeVisible()
    await expectNudging(page)
    await page.clock.runFor(10_000)
    await expectStill(page, 3_000)
  }
)

test("under reduced motion the guide is still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/en")
  await hydrated(page)

  // Over more than a whole cycle: no tap, no ring
  const scales = new Set<number>()
  for (let index = 0; index < 40; index++) {
    scales.add(await pointerScale(page))
    await page.waitForTimeout(100)
  }
  expect([...scales]).toEqual([1])
  await expect(
    page.locator(`${shownGuide} span[aria-hidden] > span.absolute`)
  ).toHaveCount(0)
})
