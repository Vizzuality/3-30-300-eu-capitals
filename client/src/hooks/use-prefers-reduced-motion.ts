import { useSyncExternalStore } from "react"

import {
  prefersReducedMotion,
  subscribeToReducedMotion,
} from "@/design/reduced-motion"

/**
 * Whether to reduce motion, for components. The server and the first render
 * in the browser assume it is not, so the page hydrates the same; the
 * browser then reads the visitor's setting.
 */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    prefersReducedMotion,
    () => false
  )
}
