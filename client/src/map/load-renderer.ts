import { lazy } from "react"

/*
 * What draws the map: deck.gl, which comes with the map only, never with
 * the first page. The accessibility tests put the stand-in map in its place.
 */
export const Renderer = lazy(() => import("@/map/deck/deck-renderer"))
