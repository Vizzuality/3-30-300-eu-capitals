import { expect, test, type Page } from "@playwright/test"

import { groundWidth, type VisibleArea } from "@/lib/visible-area"
import { southern, streetArea } from "./buildings"
import { selectionDrawn } from "./page-ready"

/*
 * A selected building on the map, in the stand-in's corner of Stockholm
 * (central Södermalm): selected with a click or a tap, its facades clicked,
 * the camera fitting each rule's evidence, and closed by a click elsewhere;
 * with the keyboard, the arrows switch rules, Tab goes through the facades
 * that see 3 trees or more, Enter selects one and Escape closes, the focus
 * kept on the map. The map and the panel always show the same building.
 */

const stockholm = "/en/capitals/stockholm"

const mapOf = (page: Page) => page.getByRole("application")
const deckOf = (page: Page) => page.locator("[data-deck-instance]")
const liveRegion = (page: Page) => page.locator("[data-map] output.sr-only")
const switcher = (page: Page) => page.getByRole("radiogroup")

/** The address's search parameter */
const param = (page: Page, name: string) =>
  new URL(page.url()).searchParams.get(name)

/** The area in the address */
function areaIn(page: Page): VisibleArea {
  const [west, south, east, north] = (param(page, "at") ?? "")
    .split(",")
    .map(Number)
  return { west, south, east, north }
}

/** Waits for the street's tiles in view to be loaded */
async function streetDrawn(page: Page) {
  await expect(deckOf(page)).toHaveAttribute("data-drawing", "true", {
    timeout: 15_000,
  })
  await expect(deckOf(page)).toHaveAttribute("data-street-tiles", /^[1-9]/)
}

/** The building, rule and facade the map shows, once their evidence arrived */
async function expectShown(
  page: Page,
  building: string,
  rule = "3",
  facade = ""
) {
  await expect(deckOf(page)).toHaveAttribute("data-selected-building", building)
  await expect(deckOf(page)).toHaveAttribute("data-selection-rule", rule)
  await expect(deckOf(page)).toHaveAttribute("data-selection-facade", facade)
}

/** The facades drawn on screen, from the map's own account */
async function facadesOf(page: Page) {
  const facades = await deckOf(page).getAttribute("data-facades")
  return JSON.parse(facades ?? "[]") as Array<{
    sid: number
    passes: boolean
    x: number
    y: number
  }>
}

/**
 * A click, or a tap on phones, at a place of the map, once the pointer over
 * it has had the map pick what is there (`over`: the building or facade it
 * says is under the pointer): a press is a click only if it is released
 * soon enough, and the map's first pick takes a while on Chrome's software
 * renderer
 */
async function pressAt(
  page: Page,
  isMobile: boolean,
  position: { x: number; y: number },
  over: { building?: RegExp; facade?: string } = {}
) {
  await mapOf(page).hover({ position })
  await expect(deckOf(page)).toHaveAttribute(
    "data-hovered-building",
    over.building ?? /^$/
  )
  await expect(deckOf(page)).toHaveAttribute(
    "data-hovered-facade",
    over.facade ?? ""
  )
  if (isMobile) {
    await mapOf(page).tap({ position })
  } else {
    await mapOf(page).click({ position })
  }
}

/**
 * A place of the map with no building under it, nor anything over the map:
 * the pointer goes over the map until the map says it is over no building
 */
async function emptyPlace(page: Page) {
  const map = await mapOf(page).boundingBox()
  if (!map) {
    throw new Error("The map has no box")
  }
  for (let y = map.height * 0.3; y < map.height * 0.8; y += 23) {
    for (let x = map.width * 0.2; x < map.width * 0.8; x += 23) {
      await page.mouse.move(map.x + x, map.y + y)
      const empty = await page.evaluate(
        ([left, top]) =>
          new Promise<boolean>((done) =>
            requestAnimationFrame(() => {
              const deck = document.querySelector<HTMLElement>(
                "[data-deck-instance]"
              )
              done(
                deck?.dataset.hoveredBuilding === "" &&
                  !deck.dataset.hoveredFacade &&
                  document.elementFromPoint(left, top)?.tagName === "CANVAS"
              )
            })
          ),
        [map.x + x, map.y + y]
      )
      if (empty) {
        return { x, y }
      }
    }
  }
  throw new Error("The map shows buildings everywhere")
}

test("a building clicked on the street is selected, and the panel follows", async ({
  page,
  isMobile,
}) => {
  await page.goto(`${stockholm}?at=${streetArea}`)
  await streetDrawn(page)
  await mapOf(page).scrollIntoViewIfNeeded()
  // The guide's pulse sits on a building with results
  const dot = page.locator("[data-pulse-dot]")
  await expect(dot).toHaveCount(1)
  const map = await mapOf(page).boundingBox()
  const pulse = await dot.boundingBox()
  if (!map || !pulse) {
    throw new Error("The map and the pulse have no box")
  }
  await pressAt(
    page,
    isMobile,
    {
      x: pulse.x + pulse.width / 2 - map.x,
      y: pulse.y + pulse.height / 2 - map.y,
    },
    { building: /^\d+$/ }
  )

  await expect.poll(() => param(page, "building")).toMatch(/^\d+$/)
  const building = param(page, "building") ?? ""
  await expectShown(page, building)
  await expect(switcher(page)).toHaveCount(1)
  await expect(page.getByText("Next · 3 of 3")).toBeVisible()
  await expect(liveRegion(page)).toHaveText(/^Selected building: \d of 3/)

  // Anywhere else on the map closes it: back to the street
  await pressAt(page, isMobile, await emptyPlace(page))
  await expect.poll(() => param(page, "building")).toBeNull()
  await expect(deckOf(page)).toHaveAttribute("data-selected-building", "")
  await expect(switcher(page)).toHaveCount(0)
})

test("a facade clicked is selected, and clicked again the whole building", async ({
  page,
  isMobile,
}) => {
  await page.goto(southern)
  await selectionDrawn(page, "31947")
  await expectShown(page, "31947")
  await mapOf(page).scrollIntoViewIfNeeded()
  const facade = (await facadesOf(page)).find(({ passes }) => passes)
  if (!facade) {
    throw new Error("Building 31947 has facades that see 3 trees")
  }

  await pressAt(page, isMobile, facade, { facade: String(facade.sid) })
  await expect.poll(() => param(page, "facade")).toBe(String(facade.sid))
  await expectShown(page, "31947", "3", String(facade.sid))
  await expect(page.getByText("Facade selected", { exact: true })).toBeVisible()
  await expect(page.getByText(/^Sees \d+ trees?$/)).toBeVisible()

  await pressAt(page, isMobile, facade, { facade: String(facade.sid) })
  await expect.poll(() => param(page, "facade")).toBeNull()
  await expectShown(page, "31947")
})

test("each rule's evidence fills the view: the 500 m circle, the walk", async ({
  page,
}) => {
  await page.goto(southern)
  await selectionDrawn(page, "31947")
  await expectShown(page, "31947")

  await page.getByRole("radio", { name: "30 % canopy not met" }).click()
  await expectShown(page, "31947", "30")
  // The camera glides out until the 1 km wide circle fits
  await expect
    .poll(() => groundWidth(areaIn(page)), { timeout: 10_000 })
    .toBeGreaterThan(1000)

  await page.getByRole("radio", { name: "300 m to a park not met" }).click()
  await expectShown(page, "31947", "300")
  // Then in again, to the walk to Vita bergen (361 m)
  await expect
    .poll(() => groundWidth(areaIn(page)), { timeout: 10_000 })
    .toBeLessThan(1000)
  await expect(page.getByText("361 m walk to Vita bergen")).toBeVisible()
  // The park's name, at the end of the walk
  await expect(page.locator("[data-park-label]")).toHaveText("Vita bergen")
})

test("with the keyboard: the arrows switch rules, Tab goes through the facades, Escape closes", async ({
  page,
}) => {
  await page.goto(southern)
  await selectionDrawn(page, "31947")
  await expectShown(page, "31947")
  await mapOf(page).focus()

  // The 3 trees rule's facades that see 3 trees or more, one after the other
  await page.keyboard.press("Tab")
  await expect(mapOf(page)).toBeFocused()
  await expect(liveRegion(page)).toHaveText(
    /^Facade 1 of 17: .+ facade, sees .+, (met|not met)$/
  )
  await page.keyboard.press("Tab")
  await expect(liveRegion(page)).toHaveText(/^Facade 2 of 17:/)
  await page.keyboard.press("Enter")
  await expect.poll(() => param(page, "facade")).toMatch(/^\d+$/)
  await expect(liveRegion(page)).toHaveText(/facade selected: sees/)
  // Enter again: the whole building
  await page.keyboard.press("Enter")
  await expect.poll(() => param(page, "facade")).toBeNull()
  await expect(liveRegion(page)).toHaveText("Whole building")

  // Left and right switch rules, round
  await page.keyboard.press("ArrowRight")
  await expect.poll(() => param(page, "rule")).toBe("30")
  await expect(liveRegion(page)).toHaveText("30 % canopy: not met")
  await page.keyboard.press("ArrowRight")
  await expect.poll(() => param(page, "rule")).toBe("300")
  await page.keyboard.press("ArrowLeft")
  await expect.poll(() => param(page, "rule")).toBe("30")
  await expect(
    page.getByRole("radio", { name: "30 % canopy not met" })
  ).toBeChecked()
  // With another rule, Tab leaves the map
  await page.keyboard.press("Tab")
  await expect(mapOf(page)).not.toBeFocused()

  // Escape closes the building once, the focus kept on the map
  await mapOf(page).focus()
  await page.keyboard.press("Escape")
  await expect.poll(() => param(page, "building")).toBeNull()
  await expect(mapOf(page)).toBeFocused()
  await expect(liveRegion(page)).toHaveText("Street level")
  // One step back is the building again: it was closed once
  await page.goBack()
  await expect.poll(() => param(page, "building")).toBe("31947")
  await expect(switcher(page)).toHaveCount(1)
})

test(
  "a building's evidence arrives, then rests, and leaves as it closes",
  { tag: "@motion" },
  async ({ page }) => {
    await page.goto(`${stockholm}?at=${streetArea}`)
    await streetDrawn(page)
    await expect(page.locator("[data-pulse-dot]")).toHaveCount(1)
    await page.evaluate(() => {
      const deck = document.querySelector<HTMLElement>("[data-deck-instance]")
      const seen: Array<string> = []
      Object.assign(window, { settling: seen })
      new MutationObserver(() =>
        seen.push(
          `${deck?.dataset.selectedBuilding}:${deck?.dataset.selectionSettled}`
        )
      ).observe(deck as HTMLElement, {
        attributes: true,
        attributeFilter: ["data-selection-settled"],
      })
    })
    const settling = () =>
      page.evaluate(() =>
        (window as unknown as { settling: Array<string> }).settling.join()
      )

    await mapOf(page).focus()
    await page.keyboard.press("Tab")
    await page.keyboard.press("Enter")
    // Its facades pop in and its sight lines draw, then it rests
    await expect.poll(settling).toMatch(/4176:false/)
    await selectionDrawn(page, "4176")
    expect(await settling()).toMatch(/4176:false.*4176:true$/)

    await page.keyboard.press("Escape")
    // The spotlight and the evidence fade out, then nothing is drawn
    await expect(deckOf(page)).toHaveAttribute("data-selected-building", "")
  }
)

/** Keeps the element in focus now, to check later that focus has not moved */
const keepFocus = (page: Page) =>
  page.evaluate(() => {
    Object.assign(window, { keptFocus: document.activeElement })
  })
const focusKept = (page: Page) =>
  page.evaluate(
    () =>
      document.activeElement ===
      (window as unknown as { keptFocus: Element | null }).keptFocus
  )

/** The facades in the order the keyboard goes through them, as drawn */
const keyboardOrder = async (page: Page) =>
  (await facadesOf(page)).map(({ sid }) => String(sid))

/**
 * Tab and Shift+Tab go through every facade of building 4176 the pointer
 * can click, passing or not, each ringed and read out, the focus staying
 * where it is; after the last, Tab leaves the map
 */
async function tabThroughFacades(page: Page) {
  const order = await keyboardOrder(page)
  const facades = await facadesOf(page)
  // Failing facades too, not only the three that see 3 trees or more
  expect(facades.filter(({ passes }) => !passes).length).toBeGreaterThan(0)
  await keepFocus(page)
  const last = order.length - 1

  // Right after selecting: every facade with Tab, then back with Shift+Tab
  for (let index = 0; index <= last; index += 1) {
    await page.keyboard.press("Tab")
    await expectFacadeInFocus(page, order, index)
  }
  for (let index = last - 1; index >= 0; index -= 1) {
    await page.keyboard.press("Shift+Tab")
    await expectFacadeInFocus(page, order, index)
  }

  // After a facade selected with Enter, then the whole building again
  await page.keyboard.press("Enter")
  await expect.poll(() => param(page, "facade")).toBe(order[0])
  await page.keyboard.press("Enter")
  await expect.poll(() => param(page, "facade")).toBeNull()
  await page.keyboard.press("Tab")
  await expectFacadeInFocus(page, order, 1)

  // After another rule and back: from the first facade again
  await page.keyboard.press("ArrowRight")
  await expect.poll(() => param(page, "rule")).toBe("30")
  await expect(deckOf(page)).toHaveAttribute("data-focused-facade", "")
  await page.keyboard.press("ArrowLeft")
  await expect.poll(() => param(page, "rule")).toBeNull()
  await selectionDrawn(page, "4176")
  for (let index = 0; index <= last; index += 1) {
    await page.keyboard.press("Tab")
    await expectFacadeInFocus(page, order, index)
  }

  // After the last, out of the map
  await page.keyboard.press("Tab")
  expect(await focusKept(page)).toBe(false)
  await expect(deckOf(page)).toHaveAttribute("data-focused-facade", "")
}

test("Tab goes through the facades of a building selected with the mouse", async ({
  page,
  isMobile,
}) => {
  await page.goto(`${stockholm}?at=${streetArea}`)
  await streetDrawn(page)
  await mapOf(page).scrollIntoViewIfNeeded()
  const dot = page.locator("[data-pulse-dot]")
  await expect(dot).toHaveCount(1)
  const map = await mapOf(page).boundingBox()
  const pulse = await dot.boundingBox()
  if (!map || !pulse) {
    throw new Error("The map and the pulse have no box")
  }
  await pressAt(
    page,
    isMobile,
    {
      x: pulse.x + pulse.width / 2 - map.x,
      y: pulse.y + pulse.height / 2 - map.y,
    },
    { building: /^4176$/ }
  )
  await selectionDrawn(page, "4176")

  await tabThroughFacades(page)
})

test("Tab goes through the facades of a building selected with the keyboard", async ({
  page,
}) => {
  await page.goto(`${stockholm}?at=${streetArea}`)
  await streetDrawn(page)
  await expect(page.locator("[data-pulse-dot]")).toHaveCount(1)
  await mapOf(page).focus()
  await page.keyboard.press("Tab")
  await page.keyboard.press("Enter")
  await selectionDrawn(page, "4176")
  await expect(mapOf(page)).toBeFocused()

  await tabThroughFacades(page)
})

/** Whether the map (its focus stop, or its canvas once clicked) has focus */
const mapHasFocus = (page: Page) =>
  page.evaluate(
    () =>
      document
        .querySelector("[role='application']")
        ?.contains(document.activeElement) === true
  )

/** Presses `key` until the focus comes back into the map */
async function tabIntoMap(page: Page, key: "Tab" | "Shift+Tab") {
  for (let presses = 0; presses < 60; presses += 1) {
    await page.keyboard.press(key)
    if (await mapHasFocus(page)) {
      return
    }
  }
  throw new Error(`${key} never came back to the map`)
}

/**
 * The facade `index` of `order` is in focus, ringed and read out with
 * whether it passes, the focus kept
 */
async function expectFacadeInFocus(
  page: Page,
  order: ReadonlyArray<string>,
  index: number
) {
  await expect(liveRegion(page)).toHaveText(
    new RegExp(
      `^Facade ${index + 1} of ${order.length}: .+ facade, .+, (met|not met)$`
    )
  )
  await expect(deckOf(page)).toHaveAttribute(
    "data-focused-facade",
    order[index]
  )
  expect(await focusKept(page)).toBe(true)
}

/** Building 4176, selected with the keyboard, and its facades in order */
async function selectWithKeyboard(page: Page) {
  await page.goto(`${stockholm}?at=${streetArea}`)
  await streetDrawn(page)
  await expect(page.locator("[data-pulse-dot]")).toHaveCount(1)
  await mapOf(page).focus()
  await page.keyboard.press("Tab")
  await page.keyboard.press("Enter")
  await selectionDrawn(page, "4176")
  return keyboardOrder(page)
}

test("the facades are gone through again after leaving the map and coming back with the keyboard", async ({
  page,
}) => {
  const order = await selectWithKeyboard(page)

  const last = order.length - 1

  // (a) Tab past the last facade, onto what follows the map, then back:
  // Shift+Tab brings the focus to the map, the next one to the last facade
  for (let presses = 0; presses <= order.length; presses += 1) {
    await page.keyboard.press("Tab")
  }
  expect(await mapHasFocus(page)).toBe(false)
  await tabIntoMap(page, "Shift+Tab")
  await keepFocus(page)
  await expect(deckOf(page)).toHaveAttribute("data-focused-facade", "")
  await page.keyboard.press("Shift+Tab")
  await expectFacadeInFocus(page, order, last)
  await page.keyboard.press("Shift+Tab")
  await expectFacadeInFocus(page, order, last - 1)
  await page.keyboard.press("Tab")
  await expectFacadeInFocus(page, order, last)

  // (b) Shift+Tab from the first facade, back to the map itself, then out
  // of it; Tab brings the focus back, the next Tab to the first facade
  for (let index = last - 1; index >= 0; index -= 1) {
    await page.keyboard.press("Shift+Tab")
    await expectFacadeInFocus(page, order, index)
  }
  await page.keyboard.press("Shift+Tab")
  await expect(deckOf(page)).toHaveAttribute("data-focused-facade", "")
  await page.keyboard.press("Shift+Tab")
  expect(await mapHasFocus(page)).toBe(false)
  await tabIntoMap(page, "Tab")
  await keepFocus(page)
  await page.keyboard.press("Tab")
  await expectFacadeInFocus(page, order, 0)
  await page.keyboard.press("Tab")
  await expectFacadeInFocus(page, order, 1)
})

test("the facades are gone through again after a control of the panel, or the map, is clicked", async ({
  page,
  isMobile,
}) => {
  const order = await selectWithKeyboard(page)

  // (c) A chip of the panel clicked, then the keys back to the map: forwards
  // to the first facade, or backwards (on phones, the panel's chips follow
  // the map band) to the last
  const chip = page.getByRole("radio", { name: "3 trees not met" })
  await chip.scrollIntoViewIfNeeded()
  await chip.click()
  await expect(chip).toBeFocused()
  const key = isMobile ? "Shift+Tab" : "Tab"
  await tabIntoMap(page, key)
  await keepFocus(page)
  await page.keyboard.press(key)
  await expectFacadeInFocus(page, order, isMobile ? order.length - 1 : 0)

  // (d) The map itself clicked, on the selected building away from its
  // facades: Tab starts from the first facade
  await mapOf(page).scrollIntoViewIfNeeded()
  const place = await buildingPlace(page, "4176")
  await mapOf(page).click({ position: place })
  await expect(deckOf(page)).toHaveAttribute("data-selected-building", "4176")
  expect(await mapHasFocus(page)).toBe(true)
  await keepFocus(page)
  await page.keyboard.press("Tab")
  await expectFacadeInFocus(page, order, 0)
  await page.keyboard.press("Tab")
  await expectFacadeInFocus(page, order, 1)
})

/**
 * A place of the map on a building and on none of its facades. The map
 * gives where the selected building's facades are on screen (each facade's
 * middle, on the building's outline); the places between them, inside the
 * building, are tried farthest from any facade first, until the map says the
 * pointer is over the building and over none of its facades.
 */
async function buildingPlace(page: Page, building: string) {
  const facades = await facadesOf(page)
  if (facades.length < 2) {
    throw new Error(`Building ${building} shows fewer than 2 facades`)
  }
  const middle = {
    x: facades.reduce((sum, { x }) => sum + x, 0) / facades.length,
    y: facades.reduce((sum, { y }) => sum + y, 0) / facades.length,
  }
  const between = facades.flatMap((a, index) =>
    facades
      .slice(index + 1)
      .map((b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }))
  )
  const awayFromFacades = ({ x, y }: { x: number; y: number }) =>
    Math.min(...facades.map((facade) => Math.hypot(facade.x - x, facade.y - y)))
  const places = [middle, ...between].map(({ x, y }) => ({
    x: Math.round(x),
    y: Math.round(y),
  }))
  places.sort((a, b) => awayFromFacades(b) - awayFromFacades(a))

  const map = await mapOf(page).boundingBox()
  if (!map) {
    throw new Error("The map has no box")
  }
  for (const place of places.slice(0, 12)) {
    await page.mouse.move(map.x + place.x, map.y + place.y)
    // What the map picks under the pointer, as of the next frame it draws
    const over = await page.evaluate(
      () =>
        new Promise<string>((done) =>
          requestAnimationFrame(() => {
            const deck = document.querySelector<HTMLElement>(
              "[data-deck-instance]"
            )
            done(
              `${deck?.dataset.hoveredBuilding}|${deck?.dataset.hoveredFacade}`
            )
          })
        )
    )
    if (over === `${building}|`) {
      return place
    }
  }
  throw new Error(`No place on building ${building} away from its facades`)
}

test("Enter on a facade that sees too few trees gives what a click on it gives", async ({
  page,
  isMobile,
}) => {
  const order = await selectWithKeyboard(page)
  const facades = await facadesOf(page)
  const failing = facades.find(({ passes }) => !passes)
  if (!failing) {
    throw new Error("Building 4176 has facades that see fewer than 3 trees")
  }
  const index = order.indexOf(String(failing.sid))
  await keepFocus(page)

  /** What the page shows of the selected facade, once it has settled */
  const shown = async () => {
    await expect.poll(() => param(page, "facade")).toBe(String(failing.sid))
    await selectionDrawn(page, "4176")
    await expect(page.locator("main [inert]")).toHaveCount(0)
    return {
      facade: await deckOf(page).getAttribute("data-selection-facade"),
      // The panel's text, without the map (its key hint shows only while
      // the keyboard is on the map, as it should)
      panel: await page.evaluate(() => {
        const main = document.querySelector("main")?.cloneNode(true)
        if (!(main instanceof HTMLElement)) {
          return ""
        }
        for (const map of main.querySelectorAll("[data-map]")) {
          map.remove()
        }
        return main.textContent
      }),
      said: await liveRegion(page).textContent(),
    }
  }

  // With the keyboard
  for (let presses = 0; presses <= index; presses += 1) {
    await page.keyboard.press("Tab")
  }
  await expectFacadeInFocus(page, order, index)
  await expect(liveRegion(page)).toHaveText(/not met$/)
  await page.keyboard.press("Enter")
  const withKeys = await shown()
  expect(withKeys.said).toMatch(/ facade selected: .+, not met$/)
  expect(withKeys.panel).toMatch(/facade selected/i)

  // Back to the whole building, then with the mouse or a finger
  await page.keyboard.press("Enter")
  await expect.poll(() => param(page, "facade")).toBeNull()
  await pressAt(page, isMobile, failing, { facade: String(failing.sid) })
  expect(await shown()).toEqual(withKeys)
})

test("dragging the map from a building never selects it", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "On phones one finger scrolls the page")
  await page.goto(`${stockholm}?at=${streetArea}`)
  await streetDrawn(page)
  const dot = page.locator("[data-pulse-dot]")
  await expect(dot).toHaveCount(1)
  const pulse = await dot.boundingBox()
  if (!pulse) {
    throw new Error("The pulse has no box")
  }
  const before = param(page, "at")
  await page.mouse.move(pulse.x, pulse.y)
  await page.mouse.down()
  await page.mouse.move(pulse.x + 60, pulse.y + 20, { steps: 6 })
  await page.mouse.up()
  // The map moved, and the address follows it, without a building
  await expect.poll(() => param(page, "at")).not.toBe(before)
  expect(param(page, "building")).toBeNull()
  await expect(deckOf(page)).toHaveAttribute("data-selected-building", "")
})
