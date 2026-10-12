import {
  createRoute,
  createRouter as createTanStackRouter,
  lazyRouteComponent,
} from "@tanstack/react-router"
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
  const router = createTanStackRouter({
    routeTree: routes,
    scrollRestoration: true,
    // The panel scrolls on its own on desktop: each new page starts at its top
    scrollToTopSelectors: ["#main"],
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
