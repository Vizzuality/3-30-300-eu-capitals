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

import { ComponentsKit } from "@/dev/kit-components"
import { routeTree } from "@/routeTree.gen"

/*
 * The controls, on their own: the kit page's Components section shows each
 * one in every state, in both themes. The kit page is not part of the site's
 * routes, so the section is rendered alone, inside a router for its links.
 */
async function renderComponentsKit() {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ["/en"] }),
  })
  await router.load()

  return render(
    <main>
      <h1>Dev kit</h1>
      <ComponentsKit />
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

describe("Kit page, Components", () => {
  test("every control in every state", async () => {
    await renderComponentsKit()

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("another tab and another chip chosen with the keyboard", async () => {
    await renderComponentsKit()

    await page.getByRole("tab", { name: "Ranking" }).first().element().focus()
    await userEvent.keyboard("{ArrowRight}{Enter}")
    await page.getByRole("radio", { name: /^3/ }).first().element().focus()
    await userEvent.keyboard("{ArrowRight}")

    await expect(document.body).toHaveNoA11yViolations()
  })
})
