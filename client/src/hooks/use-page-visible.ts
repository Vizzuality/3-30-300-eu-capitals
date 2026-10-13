import { useSyncExternalStore } from "react"

function subscribe(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange)
  return () => document.removeEventListener("visibilitychange", onChange)
}

/**
 * Whether the page can be seen: false while its tab is in the background or
 * the window is minimised, so that what loops can stop. The server assumes
 * it is seen.
 */
export function usePageVisible() {
  return useSyncExternalStore(
    subscribe,
    () => document.visibilityState === "visible",
    () => true
  )
}
