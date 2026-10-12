/*
 * Whether to reduce motion, read once from the visitor's system setting
 * (`prefers-reduced-motion`) and shared by Motion, our React components and
 * the tween helper, so they always agree. It follows the setting if the
 * visitor changes it while the page is open. The kit page can simulate
 * reduced motion, to compare both versions.
 */

const query = "(prefers-reduced-motion: reduce)"

let system: boolean | undefined
let simulated: boolean | undefined
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) {
    listener()
  }
}

function systemPreference() {
  if (system === undefined) {
    // On the server, nothing is known: motion is not reduced
    if (typeof window === "undefined" || !window.matchMedia) {
      return false
    }
    const media = window.matchMedia(query)
    system = media.matches
    media.addEventListener("change", (event) => {
      system = event.matches
      notify()
    })
  }
  return system
}

/** Whether animations should be replaced by short fades */
export function prefersReducedMotion() {
  return simulated ?? systemPreference()
}

/** Calls `listener` whenever the preference changes; returns the unsubscribe */
export function subscribeToReducedMotion(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Overrides the system setting (development only, for the kit page);
 * `undefined` follows the system again
 */
export function simulateReducedMotion(value: boolean | undefined) {
  simulated = value
  notify()
}
