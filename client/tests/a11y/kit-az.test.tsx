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

import { AzKit } from "@/dev/kit-az"
import { routeTree } from "@/routeTree.gen"

/*
 * The A–Z list on its own: the kit page's section shows Home's tabs with the
 * stand-in release, then the search field and the rows in each state, in
 * both themes. The kit page is not part of the site's routes, so the section
 * is rendered alone, inside a router for its links.
 */
async function renderAzKit() {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ["/en"] }),
  })
  await router.load()

  return render(
    <main>
      <h1>Dev kit</h1>
      <AzKit />
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

describe("Kit page, A–Z list", () => {
  test("the tabs, the search field and the rows in every state", async () => {
    await renderAzKit()

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("the A–Z tab chosen and a search typed with the keyboard", async () => {
    await renderAzKit()

    page.getByRole("tab", { name: "Ranking" }).first().element().focus()
    await userEvent.keyboard("{ArrowRight}{Enter}")
    const field = page
      .getByRole("searchbox", { name: "Find a capital or a country" })
      .first()
    field.element().focus()
    await userEvent.keyboard("Sweden")
    await expect
      .element(page.getByRole("link", { name: "Stockholm, Sweden" }).first())
      .toBeVisible()
    // The tab's content, once it has faded in
    await expect
      .poll(() =>
        [...document.querySelectorAll("[data-slot='tab-content']")].every(
          (content) => getComputedStyle(content).opacity === "1"
        )
      )
      .toBe(true)

    await expect(document.body).toHaveNoA11yViolations()
  })
})
