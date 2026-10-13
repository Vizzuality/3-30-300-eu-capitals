import "@/styles.css"
import "./no-transitions.css"

import { describe, expect, test } from "vitest"
import { page, userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"

import { GuideKit } from "@/dev/kit-guide"
import { guideStates } from "@/lib/guide"

/*
 * The Next step guide on its own: the kit page's section shows it in every
 * state, light and dark, in English and German, with Click and Tap side by
 * side. The kit page is not part of the site's routes, so the section is
 * rendered alone.
 */
function renderGuideKit() {
  return render(
    <main>
      <h1>Dev kit</h1>
      <GuideKit />
    </main>
  )
}

// Each new guide fades in (Float, a fade under reduced motion): the page is
// checked once it is in place
async function guidesInPlace() {
  await expect
    .poll(() =>
      [...document.querySelectorAll("[data-guide-state]")].every(
        (guide) => getComputedStyle(guide).opacity === "1"
      )
    )
    .toBe(true)
}

const stateButtons = [
  "Home",
  "City overview",
  "Street",
  "Selected building, rule 3",
  "Selected facade",
  "Rule 30 or 300",
]

describe("Kit page, Next step guide", () => {
  test("first state", async () => {
    await renderGuideKit()

    await expect(document.body).toHaveNoA11yViolations()
  })

  // Each state chosen with the keyboard, in English then in German
  test.each(["English", "German"])("every state, in %s", async (language) => {
    expect(stateButtons).toHaveLength(guideStates.length)
    await renderGuideKit()

    page.getByRole("button", { name: language, exact: true }).element().focus()
    await userEvent.keyboard("{Enter}")
    for (const name of stateButtons) {
      page.getByRole("button", { name, exact: true }).element().focus()
      await userEvent.keyboard("{Enter}")
      await guidesInPlace()

      await expect(document.body).toHaveNoA11yViolations()
    }
  })
})
