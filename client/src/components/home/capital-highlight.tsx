import {
  createContext,
  use,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import type { CapitalSlug } from "@/lib/capitals"

/*
 * On Home, the map and the ranking highlight each other: the capital under
 * the pointer (or in keyboard focus) on the map highlights its row, and the
 * row under the pointer (or in focus) lifts its capital on the map. Each
 * side says which capital it points at, and reads the other's.
 *
 * It lives outside React's state, so a change only re-renders what reads it.
 */

export type CapitalHighlight = {
  /** The capital the map points at */
  map: CapitalSlug | undefined
  /** The capital the ranking points at */
  list: CapitalSlug | undefined
}

class HighlightStore {
  state: CapitalHighlight = { map: undefined, list: undefined }
  private listeners = new Set<() => void>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  set = (change: Partial<CapitalHighlight>) => {
    const next = { ...this.state, ...change }
    if (next.map === this.state.map && next.list === this.state.list) {
      return
    }
    this.state = next
    for (const listener of this.listeners) {
      listener()
    }
  }
}

// Outside the provider (the kit page), nothing is shared
const HighlightContext = createContext(new HighlightStore())

/** Shares the highlight between the map and the ranking of a page */
export function CapitalHighlightProvider({
  children,
}: {
  children: ReactNode
}) {
  const [store] = useState(() => new HighlightStore())
  return <HighlightContext value={store}>{children}</HighlightContext>
}

/** The capital one side points at, re-rendering only when it changes */
export function useCapitalHighlight(side: keyof CapitalHighlight) {
  const store = use(HighlightContext)
  return useSyncExternalStore(
    store.subscribe,
    () => store.state[side],
    () => undefined
  )
}

/** Says which capital a side points at (none with undefined) */
export function useSetCapitalHighlight() {
  return use(HighlightContext).set
}
