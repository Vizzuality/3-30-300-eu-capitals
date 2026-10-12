import "@/styles.css"
import "./no-transitions.css"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  Match,
  RouterContextProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router"
import { render } from "vitest-browser-react"

import { routeTree } from "@/routeTree.gen"
import { Route as LocaleLayout } from "@/routes/$locale/route"

/*
 * Renders a page as visitors see it at `url` (search parameters included):
 * the shared layout (top bar, footer, map area) with the page inside, within
 * the router, TanStack Query and the global styles. The root's HTML document
 * is left out, since the test page already has one.
 */
export async function renderPage(url: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
  })
  await router.load()

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(<Match routeId={LocaleLayout.id} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <RouterContextProvider router={router}>
          {children}
        </RouterContextProvider>
      </QueryClientProvider>
    ),
  })
}
