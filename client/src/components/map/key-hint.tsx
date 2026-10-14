import { motion } from "motion/react"
import { useState, type ReactNode } from "react"
import { useTranslations } from "use-intl"

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import type { GuideState } from "@/lib/guide"
import { overlayPresence } from "./overlay-motion"

/*
 * The key hint: one line at the bottom of the map, while the map has the
 * keyboard's focus, saying which keys do what in the current view (Home, the
 * city overview, the street, a selected building, a facade, rules 30 and
 * 300, the same views as the Next step guide). An Ink pill, like the
 * guide's other hints, with each key in a small cap. It floats in when the
 * map gets focus (Float) and fades out when it loses it; under reduced
 * motion it only fades.
 *
 * It stays in the page while hidden (not shown, and hidden from screen
 * readers), so the map's focus stop can name it as its description
 * (`aria-describedby` with its `id`): screen readers then hear the keys as
 * the map gets focus.
 */

const keyTags = {
  key: (chunks: ReactNode) => (
    <kbd className="min-w-5 rounded-bar bg-surface/16 px-1.5 py-0.5 text-center font-sans text-key-cap">
      {chunks}
    </kbd>
  ),
}

export function KeyHint({
  state,
  visible,
  id,
}: {
  /** The map's view */
  state: GuideState
  /** Whether the map has the keyboard's focus */
  visible: boolean
  id?: string
}) {
  const t = useTranslations("map.keyHint")
  const reduced = usePrefersReducedMotion()
  const { initial, animate, exit } = overlayPresence("float", reduced)
  // Hidden once it has faded out, shown as soon as it is asked for
  const [hidden, setHidden] = useState(!visible)
  if (visible && hidden) {
    setHidden(false)
  }

  return (
    <motion.p
      id={id}
      data-key-hint={state}
      initial={initial}
      // Leaving, it fades out and drops back, ready to rise again
      animate={visible ? animate : { ...exit, y: initial.y }}
      onAnimationComplete={() => {
        if (!visible) {
          setHidden(true)
        }
      }}
      style={{ visibility: hidden ? "hidden" : "visible" }}
      className="flex max-w-full flex-wrap items-center justify-center gap-x-1 gap-y-0.5 rounded-panel bg-ink px-3.5 py-1.5 text-tag text-surface shadow-lift"
    >
      {t.rich(state, keyTags)}
    </motion.p>
  )
}
