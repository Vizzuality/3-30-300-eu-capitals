import { useSyncExternalStore } from "react"

function subscribe() {
  return () => {}
}

/**
 * Whether the page is running in the browser, past hydration: false on the
 * server and while the browser takes over the server's HTML, so what only
 * the browser knows (such as the history entry's state) is shown once the
 * HTML matches, without a mismatch.
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
