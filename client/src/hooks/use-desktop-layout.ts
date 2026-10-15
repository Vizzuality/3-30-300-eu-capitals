import { useSyncExternalStore } from "react"

import { breakpoints } from "@/design/tokens"

/** From this width, the panel and the map sit side by side */
export const desktopQuery = `(min-width: ${breakpoints.desktop / 16}rem)`

function subscribe(listener: () => void) {
  const media = window.matchMedia(desktopQuery)
  media.addEventListener("change", listener)
  return () => media.removeEventListener("change", listener)
}

/**
 * Whether the page has the desktop layout (the panel beside the map) rather
 * than the phone's single column, followed as the window is resized. The
 * server knows nothing of the window, and assumes the desktop.
 */
export function useDesktopLayout() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(desktopQuery).matches,
    () => true
  )
}
