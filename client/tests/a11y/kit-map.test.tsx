import "@/styles.css"
import "./no-transitions.css"

import { describe, expect, test } from "vitest"
import { page, userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"

import { MapOverlaysKit } from "@/dev/kit-map"

/*
 * The map's overlays on their own: the kit page's section shows each one in
 * every state, light and dark, around a stand-in map. The kit page is not
 * part of the site's routes, so the section is rendered alone.
 */
async function renderMapKit() {
  const screen = await render(
    <main>
      <h1>Dev kit</h1>
      <MapOverlaysKit />
    </main>
  )
  await settled()
  return screen
}

const views = [
  "Home",
  "City overview",
  "Street",
  "Selected building, rule 3",
  "Selected facade",
  "Rule 30",
  "Rule 300",
]

// Overlays fade in and out (a fade under reduced motion, which Motion plays
// with the browser's animations): the page is checked once they are done
async function settled() {
  await expect
    .poll(() =>
      document
        .getAnimations()
        .every((animation) => animation.playState !== "running")
    )
    .toBe(true)
}

// The name of the element in focus
const focused = () =>
  document.activeElement?.getAttribute("aria-label") ??
  document.activeElement?.textContent

describe("Kit page, Map overlays", () => {
  test("every overlay in every state", async () => {
    await renderMapKit()

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("each view chosen with the keyboard", async () => {
    await renderMapKit()

    for (const name of views) {
      page.getByRole("button", { name, exact: true }).element().focus()
      await userEvent.keyboard("{Enter}")
      await settled()

      await expect(document.body).toHaveNoA11yViolations()
    }
  })

  test("the stand-in map and its controls reached with the keyboard", async () => {
    await renderMapKit()

    // The stand-in map, with its key hint
    page.getByRole("application").first().element().focus()
    await settled()
    await expect(document.body).toHaveNoA11yViolations()

    // Then "Whole city"
    await userEvent.keyboard("{Tab}")
    expect(focused()).toBe("Whole city")
    await expect(document.body).toHaveNoA11yViolations()

    // And the attribution's links, after the zoom buttons on desktop
    page
      .getByRole("link", { name: "© OpenStreetMap" })
      .first()
      .element()
      .focus()
    await expect(document.body).toHaveNoA11yViolations()
  })

  // The phone's layout (also a desktop at 200% zoom) has no zoom buttons
  test.skipIf(!window.matchMedia("(min-width: 64rem)").matches)(
    "zoom in up to the closest zoom, with the keyboard",
    async () => {
      await renderMapKit()

      page.getByRole("button", { name: "Whole city" }).first().element().focus()
      await userEvent.keyboard("{Tab}")
      expect(focused()).toBe("Zoom in")
      // At the closest zoom, the button is disabled and keeps the focus
      for (let step = 0; step < 8; step += 1) {
        await userEvent.keyboard("{Enter}")
      }
      expect(focused()).toBe("Zoom in")
      expect(document.activeElement?.getAttribute("aria-disabled")).toBe("true")
      await expect(document.body).toHaveNoA11yViolations()

      await userEvent.keyboard("{Tab}")
      expect(focused()).toBe("Zoom out")
      await userEvent.keyboard("{Tab}")
      expect(focused()).toBe("© OpenStreetMap")
      await expect(document.body).toHaveNoA11yViolations()
    }
  )

  test("the phone's hint shown", async () => {
    await renderMapKit()

    page
      .getByRole("button", { name: "One-finger sideways drag" })
      .first()
      .element()
      .focus()
    await userEvent.keyboard("{Enter}")
    await settled()

    await expect(document.body).toHaveNoA11yViolations()
  })
})
