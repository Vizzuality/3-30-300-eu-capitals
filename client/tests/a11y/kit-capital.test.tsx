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
 * The capital page's header and Other capitals on their own: the kit page's
 * section shows them with the stand-in release, then the rows of Other
 * capitals in each state, in both themes. The kit page is not part of the
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
  test("the header and Other capitals in every state", async () => {
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
})
