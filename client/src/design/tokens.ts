/*
 * The design tokens of the site (colours, type, shape, spacing), defined once.
 * Tailwind reads them as CSS custom properties from `tokens.css`, generated
 * from this file by `pnpm tokens`; the map will read the colours from here
 * directly.
 *
 * Motion tokens arrive with the motion system.
 */

/** A colour with its value in light and in dark mode */
export type ThemeColor = { light: string; dark: string }

/**
 * Warm, soft colours. Results run from a light terracotta (no rule met) to a
 * deep one (all three); in dark mode their lightness is reversed, so more
 * rules met always stands out most. Greenery has its own green, never used
 * for results.
 */
export const colors = {
  // Interface
  background: { light: "#f5f1e8", dark: "#191714" },
  surface: { light: "#fffcf5", dark: "#22201c" },
  surface2: { light: "#f6efe2", dark: "#2b2823" },
  ink: { light: "#2e2a25", dark: "#f3eee6" },
  ink2: { light: "#686055", dark: "#b7ad9f" },
  line: { light: "#e5dccb", dark: "#3b372f" },

  // Results: the number of rules met, from none to all three
  result0: { light: "#d39e8a", dark: "#7c4d3b" },
  result1: { light: "#c07456", dark: "#b06548" },
  result2: { light: "#a05130", dark: "#da8564" },
  result3: { light: "#77361a", dark: "#faad8f" },

  // Muted results: the bars of the other capitals on the capital page
  resultMuted0: { light: "#c4ada4", dark: "#6a564e" },
  resultMuted1: { light: "#a9938a", dark: "#806b63" },
  resultMuted2: { light: "#8f7971", dark: "#978178" },
  resultMuted3: { light: "#766159", dark: "#ae978f" },

  // Greenery, water and facades
  tree: { light: "#66b98b", dark: "#4fa879" },
  park: { light: "#dae3c2", dark: "#313925" },
  water: { light: "#bbd7da", dark: "#1e343a" },
  shallows: { light: "#e9f1ef", dark: "#24332f" },
  passes: { light: "#2e2a25", dark: "#f3eee6" },

  // Map
  land: { light: "#f6f0e3", dark: "#2c2924" },
  street: { light: "#fffcf4", dark: "#3b3730" },
  streetCasing: { light: "#e6dac3", dark: "#24211d" },
  building: { light: "#e8dfcf", dark: "#3d3932" },
  shadow: { light: "#2e2a2529", dark: "#00000029" }, // Ink, then black, at 16%
  treeRim: { light: "#5b7440", dark: "#3d5130" },
  waterLines: { light: "#6f8c93", dark: "#7f9aa1" },

  // Europe, on the Home map
  europeLand1: { light: "#f5efe2", dark: "#2f2b25" },
  europeLand2: { light: "#ede5d5", dark: "#28251f" },
  europeLand3: { light: "#f1eadc", dark: "#2c2822" },
  europeOther: { light: "#ebe5da", dark: "#25221d" },
  europeSea: { light: "#dde8e6", dark: "#1c2626" },
} as const satisfies Record<string, ThemeColor>

/**
 * The interface is flat: only what floats over the map (map controls, legend,
 * capital label, pulse) and the language list get this very soft lift
 */
export const shadows = {
  lift: {
    light: "0 1px 2px #2e2a2514, 0 6px 18px #2e2a251a",
    dark: "0 1px 2px #0000004d, 0 6px 18px #00000059",
  },
} as const satisfies Record<string, ThemeColor>

/** Titles in Fraunces, reading and interface in Figtree */
export const fonts = {
  // Noto Serif and Noto Sans take over for Greek and Cyrillic
  serif: ["Fraunces Variable", "Noto Serif Variable", "Georgia", "serif"],
  sans: ["Figtree Variable", "Noto Sans Variable", "system-ui", "sans-serif"],
} as const

/** Fraunces in its soft cut, with rounded serif terminals */
export const serifVariationSettings = '"SOFT" 100, "WONK" 0'

export type TypeStyle = {
  font: keyof typeof fonts
  /** In pixels */
  size: number
  /** In pixels */
  lineHeight: number
  weight: number
  /** In em */
  letterSpacing?: number
  uppercase?: boolean
}

/** Every text style of the site */
export const typeScale = {
  // Home title
  display: {
    font: "serif",
    size: 40,
    lineHeight: 44,
    weight: 500,
    letterSpacing: -0.015,
  },
  // Home title on phones
  displayPhone: {
    font: "serif",
    size: 34,
    lineHeight: 38,
    weight: 500,
    letterSpacing: -0.015,
  },
  // Capital name, page titles
  title: {
    font: "serif",
    size: 28,
    lineHeight: 32,
    weight: 500,
    letterSpacing: -0.01,
  },
  // Card results, the ranking sentence, section titles
  heading: { font: "serif", size: 20, lineHeight: 26, weight: 500 },
  // Text
  body: { font: "sans", size: 16, lineHeight: 24, weight: 400 },
  // The Next step guide
  guide: { font: "sans", size: 15, lineHeight: 21, weight: 600 },
  // Top bar links, tabs, rows, buttons
  control: { font: "sans", size: 14, lineHeight: 20, weight: 500 },
  // Notes, legends, ranking, footer
  small: { font: "sans", size: 13, lineHeight: 18, weight: 400 },
  // Section labels such as "Other capitals"
  label: {
    font: "sans",
    size: 12,
    lineHeight: 16,
    weight: 600,
    letterSpacing: 0.08,
    uppercase: true,
  },
} as const satisfies Record<string, TypeStyle>

/** Corner radii, in pixels; icon buttons are fully round */
export const radii = {
  chip: 8, // chips, legend swatches
  control: 14, // buttons, cards, fields, tabs, the guide
  panel: 22, // panels, menus, map frames
} as const

/** Sizes of the layout, in pixels */
export const spacing = {
  panel: 480, // width of the panel on desktop
  panelInset: 32, // side padding of the panel on desktop
  panelInsetPhone: 20,
  topBar: 64, // height of the top bar on desktop
  topBarPhone: 56,
  block: 22, // between blocks of the panel
  mapInset: 16, // map overlays from the edge
  target: 40, // smallest touch target in the panel on desktop
  targetPhone: 44, // on phones and on the map
} as const

/**
 * Width from which the desktop layout (the panel beside the map) replaces the
 * phone's single column, in pixels. Written in rem in the CSS, so it follows
 * the visitor's text size.
 */
export const breakpoints = {
  desktop: 1024,
} as const
