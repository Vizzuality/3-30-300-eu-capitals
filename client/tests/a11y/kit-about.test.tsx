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

import { AboutKit } from "@/dev/kit-about"
import { routeTree } from "@/routeTree.gen"

/*
 * The footer and the blocks of the About page on their own: the kit page's
 * section shows the footer (today, and with the link to the code), the back
 * link to each page About can be opened from, and the page's sections, in
 * both themes. The kit page is not part of the site's routes, so the section
 * is rendered alone, inside a router for its links.
 */
async function renderAboutKit() {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ["/en/about"] }),
  })
  await router.load()

  return render(
    <main>
      <h1>Dev kit</h1>
      <AboutKit />
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

describe("Kit page, About and footer", () => {
  test("the footer and the About page's blocks, light and dark", async () => {
    await renderAboutKit()

    await expect(document.body).toHaveNoA11yViolations()
  })

  test("a back link reached with the keyboard", async () => {
    await renderAboutKit()

    page
      .getByRole("link", { name: "Back to the map" })
      .first()
      .element()
      .focus()
    await userEvent.keyboard("{Tab}")
    await expect
      .element(page.getByRole("link", { name: "Back to the map" }).nth(1))
      .toHaveFocus()

    await expect(document.body).toHaveNoA11yViolations()
  })
})
