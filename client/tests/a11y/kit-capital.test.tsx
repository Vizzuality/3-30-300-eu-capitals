import "@/styles.css"
import "./no-transitions.css"

import { QueryClient } from "@tanstack/react-query"
import {
  RouterContextProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router"
import { describe, expect, test } from "vitest"
import { page, userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"

import { CapitalKit } from "@/dev/kit-capital"
import { routeTree } from "@/routeTree.gen"

/*
 * The capital page's header, middle block and Other capitals on their own:
 * the kit page's section shows them with the stand-in release, then the
 * middle block (overview, street, a building with each rule and a facade,
 * every card met and not met) and the rows of Other capitals in each state,
 * in both themes. The kit page is not part of the
 * site's routes, so the section is rendered alone, inside a router for its
 * links.
 */
async function renderCapitalKit() {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({
      initialEntries: ["/en/capitals/stockholm"],
    }),
  })
  await router.load()

  return render(
    <main>
      <h1>Dev kit</h1>
      <CapitalKit />
    </main>,
    {
      wrapper: ({ children }) => (
        <RouterContextProvider router={router}>
          {children}
        </RouterContextProvider>
      ),
    }
  )
}

describe("Kit page, Capital page", () => {
  test("the header, the middle block and Other capitals in every state", async () => {
    await renderCapitalKit()

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("a row of Other capitals reached with the keyboard", async () => {
    await renderCapitalKit()

    page
      .getByRole("link", { name: /^Paris, rank 16:/ })
      .first()
      .element()
      .focus()
    await userEvent.keyboard("{Tab}")
    await expect
      .element(page.getByRole("link", { name: /^Brussels, rank 18:/ }).first())
      .toHaveFocus()

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("the rule switcher to try, operated with the keyboard", async () => {
    await renderCapitalKit()

    const demo = page.getByRole("radiogroup", { name: "Rule shown" }).first()
    demo.getByRole("radio", { name: "3 trees met" }).element().focus()
    await userEvent.keyboard("{ArrowLeft}")
    await expect
      .element(demo.getByRole("radio", { name: "300 m to a park not met" }))
      .toBeChecked()
    await expect
      .element(page.getByText("361 m walk to Vita bergen").first())
      .toBeInTheDocument()
    await expect
      .poll(() =>
        [...document.querySelectorAll("[data-slot='swap-part']")].every(
          (part) =>
            !part.hasAttribute("inert") &&
            getComputedStyle(part).opacity === "1"
        )
      )
      .toBe(true)

    await expect(document.body).toHaveNoA11yViolations()
  })
})
