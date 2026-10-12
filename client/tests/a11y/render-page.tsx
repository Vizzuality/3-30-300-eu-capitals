import "@/styles.css"
import "./no-transitions.css"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  RouterContextProvider,
  createMemoryHistory,
  createRouter,
  type AnyRoute,
} from "@tanstack/react-router"
import { render } from "vitest-browser-react"

import { routeTree } from "@/routeTree.gen"

/*
 * Renders a page's route component as visitors see it at `url` (search
 * parameters included): inside the router, TanStack Query and the global
 * styles.
 */
export async function renderPage(route: AnyRoute, url: string) {
  const Page = route.options.component
  if (!Page) {
    throw new Error(`The route ${route.id} has no component`)
  }

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
  })
  await router.load()

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(<Page />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <RouterContextProvider router={router}>
          {children}
        </RouterContextProvider>
      </QueryClientProvider>
    ),
  })
}
