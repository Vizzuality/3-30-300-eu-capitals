/*
 * Light and dark side by side on the kit page, whatever the system's colour
 * scheme: a box that sets the colour tokens of one theme on itself, so
 * everything inside it is drawn in that theme. Development only.
 */
import type { CSSProperties, ReactNode } from "react"

import { colors, shadows, type ThemeColor } from "@/design/tokens"
import { toCssName } from "@/design/tokens-css"
import { cn } from "@/lib/utils"

type Theme = keyof ThemeColor

function themeVariables(theme: Theme) {
  const entries = [...Object.entries(colors), ...Object.entries(shadows)].map(
    ([key, value]) => [`--${toCssName(key)}`, value[theme]]
  )
  return { ...Object.fromEntries(entries), colorScheme: theme } as CSSProperties
}

/** Draws its content in one theme, on the panel's Surface */
export function ThemeScope({
  theme,
  className,
  children,
}: {
  theme: Theme
  className?: string
  children: ReactNode
}) {
  return (
    <div
      data-theme={theme}
      style={themeVariables(theme)}
      className={cn("bg-surface text-ink", className)}
    >
      {children}
    </div>
  )
}

/** The same content twice: in the light theme, then in the dark one */
export function ThemePair({ children }: { children: ReactNode }) {
  return (
    <div className="grid overflow-hidden rounded-control border border-line desktop:grid-cols-2">
      {(["light", "dark"] as const).map((theme) => (
        <ThemeScope
          key={theme}
          theme={theme}
          className="flex min-w-0 flex-col gap-4 p-5"
        >
          <p className="text-label text-ink-2 uppercase">
            {theme === "light" ? "Light" : "Dark"}
          </p>
          {children}
        </ThemeScope>
      ))}
    </div>
  )
}
