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
import { withStandInRelease } from "./stand-in-release"

/*
 * Renders a page as visitors see it at `url` (search parameters included):
 * the shared layout (top bar, footer, map area) with the page inside, within
 * the router, TanStack Query and the global styles. The root's HTML document
 * is left out, since the test page already has one. The pages show the
 * stand-in release, already in the query cache, so nothing is fetched.
 */
export async function renderPage(url: string) {
  const queryClient = withStandInRelease(
    new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: "static" } },
    })
  )

  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [url] }),
  })
  await router.load()

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
