import { expect, type Page } from "@playwright/test"

/**
 * Waits for the page to be hydrated, so its links are the router's, and for
 * its map to be set up (deck.gl and its WebGL context, whether the map is
 * shown or hidden), so that the map starting does not compete with what the
 * test does next
 */
export async function hydrated(page: Page) {
  await expect(page.locator("[data-map-area]")).toHaveAttribute(
    "data-instance",
    /.+/
  )
  // WebGL on Chrome's software renderer can take a few seconds to set up
  // while other tests run alongside
  await expect(page.locator("[data-deck-instance]")).toHaveAttribute(
    "data-drawing",
    /^(true|false)$/,
    { timeout: 15_000 }
  )
}

/**
 * Waits for the map to draw the selected building, read from its tiles,
 * and the evidence of its rule (the address's, unless given) to finish
 * arriving: the street's first frames, and the evidence's, make their
 * shaders as they are first drawn, which takes seconds on Chrome's software
 * renderer while other tests run alongside
 */
export async function selectionDrawn(
  page: Page,
  building: string,
  rule = new URL(page.url()).searchParams.get("rule") ?? "3"
) {
  const deck = page.locator("[data-deck-instance]")
  await expect(deck).toHaveAttribute("data-selected-building", building, {
    timeout: 15_000,
  })
  await expect(deck).toHaveAttribute("data-selection-rule", rule, {
    timeout: 15_000,
  })
  await expect(deck).toHaveAttribute("data-selection-settled", "true", {
    timeout: 15_000,
  })
}
