import { expect, test, type Locator, type Page } from "@playwright/test"

import { southern, streetArea } from "./buildings"
import { hydrated, selectionDrawn, selectionLeft } from "./page-ready"

/*
 * A selected building in the panel, opened from its address: its rule
 * switcher (3 · 30 · 300) with the mouse, a finger or the keyboard, each
 * rule a step in the browser's history; a facade left when the rule
 * changes; closing it with its button or Escape; and an address that is not
 * valid. The building is a real one of Stockholm, read from the stand-in
 * release's tiles.
 */

const BUILDING = southern

async function press(target: Locator, isMobile: boolean) {
  await target.scrollIntoViewIfNeeded()
  if (isMobile) {
    await target.tap()
  } else {
    await target.click()
  }
}

const chip = (page: Page, name: string) =>
  page.getByRole("radio", { name, exact: true })

const rule3 = (page: Page) => chip(page, "3 trees met")
const rule30 = (page: Page) => chip(page, "30 % canopy not met")
const rule300 = (page: Page) => chip(page, "300 m to a park not met")

/** The card shown, and the one it replaced gone */
async function expectCard(page: Page, result: string) {
  await expect(page.getByText(result, { exact: true })).toBeVisible()
  await expect(page.locator("main [inert]")).toHaveCount(0)
}

/**
 * The building is selected, with this rule's chip chosen and its card, once
 * the map has drawn the rule's evidence
 */
async function expectRule(page: Page, rule: Locator, result: string) {
  await selectionDrawn(
    page,
    "31947",
    (/^\d+/.exec((await rule.textContent()) ?? "") ?? ["3"])[0]
  )
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Selected building · about 151 residents",
    })
  ).toBeVisible()
  await expect(rule).toBeChecked()
  await expectCard(page, result)
}

/** The street's sentence in the middle block */
const streetSentence =
  "Each building takes the colour of the number of rules its residents meet. Greenery has its own colour."

/**
 * The building has gone: the street around it is shown again, on the map
 * and in the block, once the map has drawn it without the building
 */
async function expectStreet(page: Page) {
  await expect.poll(() => shown(page)).toEqual({ building: null, rule: null })
  await selectionLeft(page)
  await expect(page.getByText(streetSentence)).toBeVisible()
  await expect(page.getByRole("radiogroup")).toHaveCount(0)
}

/**
 * The building and the rule in the address (the area in view follows the
 * camera, which fits each rule's evidence)
 */
function shown(page: Page) {
  const search = new URL(page.url()).searchParams
  return {
    building: search.get("building"),
    rule: search.get("rule"),
    ...(search.has("facade") && { facade: search.get("facade") }),
  }
}

/** The address shows this rule (3 is left out) for the building */
const expectAddress = (page: Page, rule: string | null) =>
  expect.poll(() => shown(page)).toEqual({ building: "31947", rule })

test("a building opens from its address, on the 3 trees rule", async ({
  page,
}) => {
  await page.goto(BUILDING)
  await hydrated(page)
  await selectionDrawn(page, "31947")

  await expectRule(page, rule3(page), "54% of residents see 3 trees or more")
  await expect(rule30(page)).not.toBeChecked()
  await expect(rule300(page)).not.toBeChecked()
  await expect(
    page.getByText(
      "5 of its 17 facades see 3 trees or more. Each facade shows the trees it can see."
    )
  ).toBeVisible()
})

test("rules switch with the mouse or a finger, each one in the address", async ({
  page,
  isMobile,
}) => {
  await page.goto(BUILDING)
  await hydrated(page)
  await selectionDrawn(page, "31947")

  await press(rule30(page), isMobile)
  await expectAddress(page, "30")
  await expectRule(page, rule30(page), "20% tree canopy")

  await press(rule300(page), isMobile)
  await expectAddress(page, "300")
  await expectRule(page, rule300(page), "361 m walk to Vita bergen")

  // The 3 trees rule, shown by default, is left out of the address
  await press(rule3(page), isMobile)
  await expectAddress(page, null)
  await expectRule(page, rule3(page), "54% of residents see 3 trees or more")
})

test("rules switch with the keyboard, each one in the address", async ({
  page,
}) => {
  await page.goto(BUILDING)
  await hydrated(page)
  await selectionDrawn(page, "31947")

  // One Tab stop for the switcher, after the close button
  await page.getByRole("button", { name: "Close the building" }).focus()
  await page.keyboard.press("Tab")
  await expect(rule3(page)).toBeFocused()

  await page.keyboard.press("ArrowRight")
  await expectAddress(page, "30")
  await expectRule(page, rule30(page), "20% tree canopy")
  await expect(rule30(page)).toBeFocused()

  await page.keyboard.press("ArrowRight")
  await expectAddress(page, "300")
  await expectRule(page, rule300(page), "361 m walk to Vita bergen")

  // Round to the first rule
  await page.keyboard.press("ArrowRight")
  await expectAddress(page, null)
  await expectRule(page, rule3(page), "54% of residents see 3 trees or more")
})

test("another rule leaves the selected facade", async ({ page, isMobile }) => {
  await page.goto(`${BUILDING}&facade=102293`)
  await hydrated(page)
  await selectionDrawn(page, "31947")

  await expectCard(page, "Sees 6 trees")
  await expect(
    page.getByText("North-east facade · about 31 residents")
  ).toBeVisible()

  await press(rule30(page), isMobile)
  await expectAddress(page, "30")
  await expectRule(page, rule30(page), "20% tree canopy")

  // Back on the 3 trees rule, the whole building
  await press(rule3(page), isMobile)
  await expectAddress(page, null)
  await expectRule(page, rule3(page), "54% of residents see 3 trees or more")
})

test("the close button closes the building, back to the street", async ({
  page,
  isMobile,
}) => {
  await page.goto(`${BUILDING}&rule=300`)
  await hydrated(page)
  await selectionDrawn(page, "31947")

  await press(
    page.getByRole("button", { name: "Close the building" }),
    isMobile
  )
  await expectStreet(page)
})

test("Escape closes the building, the focus kept in the block", async ({
  page,
}) => {
  await page.goto(`${BUILDING}&rule=30`)
  await hydrated(page)
  await selectionDrawn(page, "31947")

  await rule30(page).focus()
  await page.keyboard.press("Escape")
  await expectStreet(page)
  // The focus stays where the switcher was, rather than going back to the
  // start of the page
  expect(
    await page.evaluate((sentence) => {
      const focused = document.activeElement
      return (
        focused?.tagName === "DIV" &&
        focused.textContent === sentence &&
        focused.querySelector("h1") === null
      )
    }, streetSentence)
  ).toBe(true)
})

test("an address with values that are not valid still opens", async ({
  page,
}) => {
  // A rule that does not exist is the 3 trees rule; a facade id that is not
  // a number is dropped
  await page.goto(`${BUILDING}&rule=5&facade=abc`)
  await hydrated(page)
  await selectionDrawn(page, "31947")
  await expectRule(page, rule3(page), "54% of residents see 3 trees or more")

  // A building id out of range: the city overview
  await page.goto("/en/capitals/stockholm?building=99999999&rule=30")
  await hydrated(page)
  await expect(page.getByText("Residents meeting each rule")).toBeVisible()
  await expect(page.getByRole("radiogroup")).toHaveCount(0)

  // A building without the area to find it in, or that the area's tiles do
  // not hold: the map's view, the building left out of the address
  await page.goto("/en/capitals/stockholm?building=31947&rule=30")
  await hydrated(page)
  await expect(page).toHaveURL("/en/capitals/stockholm")
  await expect(page.getByText("Residents meeting each rule")).toBeVisible()
  await page.goto(`/en/capitals/stockholm?building=1227&at=${streetArea}`)
  await hydrated(page)
  await expect(page).toHaveURL(`/en/capitals/stockholm?at=${streetArea}`)
  await expect(page.getByText(streetSentence)).toBeVisible()
  await expect(page.getByRole("radiogroup")).toHaveCount(0)
})

test("back and forward go through the rules shown", async ({
  page,
  isMobile,
}) => {
  await page.goto(BUILDING)
  await hydrated(page)
  await selectionDrawn(page, "31947")

  await press(rule30(page), isMobile)
  await expectAddress(page, "30")
  await press(rule300(page), isMobile)
  await expectAddress(page, "300")
  await expectCard(page, "361 m walk to Vita bergen")

  await page.goBack()
  await expectAddress(page, "30")
  await expectRule(page, rule30(page), "20% tree canopy")

  await page.goBack()
  await expectAddress(page, null)
  await expectRule(page, rule3(page), "54% of residents see 3 trees or more")

  await page.goForward()
  await expectAddress(page, "30")
  await expectRule(page, rule30(page), "20% tree canopy")
})
