import { useSyncExternalStore } from "react"

import { colors } from "@/design/tokens"

/*
 * The map's colours, from the design tokens, as deck.gl wants them: red,
 * green, blue and alpha from 0 to 255. They follow the visitor's colour
 * scheme, so switching between light and dark recolours the map's layers
 * without loading anything again.
 */

export type Rgba = [number, number, number, number]

export type ColorScheme = "light" | "dark"

export type MapColors = Record<keyof typeof colors, Rgba>

/** A `#rrggbb` or `#rrggbbaa` colour as RGBA */
export function toRgba(hex: string): Rgba {
  const match = /^#([\da-f]{6})([\da-f]{2})?$/i.exec(hex)
  if (!match) {
    throw new Error(`"${hex}" is not a #rrggbb or #rrggbbaa colour`)
  }
  const [r, g, b] = [0, 2, 4].map((at) =>
    Number.parseInt(match[1].slice(at, at + 2), 16)
  )
  return [r, g, b, match[2] ? Number.parseInt(match[2], 16) : 255]
}

/** Every colour token, in a colour scheme */
export function mapColors(scheme: ColorScheme): MapColors {
  return Object.fromEntries(
    Object.entries(colors).map(([name, color]) => [name, toRgba(color[scheme])])
  ) as MapColors
}

/** A colour with another opacity, from 0 to 1 */
export function withOpacity([r, g, b]: Rgba, opacity: number): Rgba {
  return [r, g, b, Math.round(opacity * 255)]
}

const darkQuery = "(prefers-color-scheme: dark)"

function subscribe(listener: () => void) {
  const media = window.matchMedia(darkQuery)
  media.addEventListener("change", listener)
  return () => media.removeEventListener("change", listener)
}

/** The visitor's colour scheme, followed as it changes */
export function useColorScheme(): ColorScheme {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(darkQuery).matches ? "dark" : "light"),
    () => "light"
  )
}
