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
