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

import { RankingKit } from "@/dev/kit-ranking"
import { routeTree } from "@/routeTree.gen"

/*
 * The ranking on its own: the kit page's section shows it with the stand-in
 * release, then its rows in each state, in both themes. The kit page is not
 * part of the site's routes, so the section is rendered alone, inside a
 * router for its links.
 */
async function renderRankingKit() {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ["/en"] }),
  })
  await router.load()

  return render(
    <main>
      <h1>Dev kit</h1>
      <RankingKit />
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

describe("Kit page, Ranking", () => {
  test("the ranking and its rows in every state", async () => {
    await renderRankingKit()

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("a row reached with the keyboard", async () => {
    await renderRankingKit()

    page
      .getByRole("link", { name: /^Helsinki, rank 1:/ })
      .first()
      .element()
      .focus()
    await userEvent.keyboard("{Tab}")
    await expect
      .element(page.getByRole("link", { name: /^Berlin, rank 2:/ }).first())
      .toHaveFocus()

    await expect(document.body).toHaveNoA11yViolations()
  })
})
