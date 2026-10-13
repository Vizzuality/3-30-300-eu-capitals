import { QueryClient } from "@tanstack/react-query"
import {
  createRoute,
  createRouter as createTanStackRouter,
  lazyRouteComponent,
} from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"

import { routeTree } from "./routeTree.gen"

/*
 * The kit page (`/dev/kit`) exists only in development: it is added here
 * rather than as a file route, so the production build has neither its route
 * nor its code.
 */
function withDevelopmentRoutes(tree: typeof routeTree) {
  const kit = createRoute({
    getParentRoute: () => tree,
    path: "/dev/kit",
    component: lazyRouteComponent(() => import("./dev/kit-page"), "KitPage"),
  })

  return tree.addChildren([
    ...Object.values(tree.children ?? {}),
    kit,
  ]) as unknown as typeof routeTree
}

const routes = import.meta.env.DEV
  ? withDevelopmentRoutes(routeTree)
  : routeTree

export function getRouter() {
  /*
   * One query cache per router: on the server, each request renders with its
   * own. The data loaded on the server (or at build time) is written into the
   * page and taken over by the browser's cache, so it is not fetched again.
   */
  const queryClient = new QueryClient({
    // A release never changes while the site runs, so its data never goes
    // stale; a page reload starts with an empty cache
    defaultOptions: { queries: { staleTime: "static" } },
  })

  const router = createTanStackRouter({
    routeTree: routes,
    context: { queryClient },
    scrollRestoration: true,
    // The panel scrolls on its own on desktop: each new page starts at its top
    scrollToTopSelectors: ["#main"],
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  })
  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
