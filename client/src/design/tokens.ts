/*
 * The design tokens of the site (colours, type, shape, spacing, motion),
 * defined once. Tailwind reads them as CSS custom properties from
 * `tokens.css`, generated from this file by `pnpm tokens`; the map will read
 * the colours from here directly. Motion and the map's tween helper read the
 * motion tokens through `tokens-motion.ts`.
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

  // The figures (0 to 3) written on the result colours, in the legend's
  // chips: Ink or Surface, whichever reads best, and darker still on Results
  // 1, a mid-tone that neither reaches 4.5:1 against
  onResult0: { light: "#2e2a25", dark: "#f3eee6" },
  onResult1: { light: "#191714", dark: "#000000" },
  onResult2: { light: "#fffcf5", dark: "#22201c" },
  onResult3: { light: "#fffcf5", dark: "#22201c" },

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
  // The Next step guide's sentence
  guide: { font: "sans", size: 15, lineHeight: 21, weight: 600 },
  // The Next step guide's step label ("Next · 2 of 3"), above its sentence
  guideStep: {
    font: "sans",
    size: 11,
    lineHeight: 14,
    weight: 600,
    letterSpacing: 0.08,
    uppercase: true,
  },
  // Top bar links, tabs, rows, buttons
  control: { font: "sans", size: 14, lineHeight: 20, weight: 500 },
  // What is typed in a field (the A–Z list's search)
  field: { font: "sans", size: 15, lineHeight: 20, weight: 400 },
  // A capital's name in the A–Z list, above its country
  listName: { font: "sans", size: 15, lineHeight: 20, weight: 600 },
  // Notes, legends, ranking, footer
  small: { font: "sans", size: 13, lineHeight: 18, weight: 400 },
  // The figures of the rule cards and of the rule switcher's chips ("3",
  // "30%", "300 m")
  figure: { font: "serif", size: 24, lineHeight: 28, weight: 500 },
  // What a figure counts ("trees", "% canopy"), under it
  figureUnit: { font: "sans", size: 13, lineHeight: 16, weight: 400 },
  // Whether a rule is met, next to its mark ("met", "not met")
  status: { font: "sans", size: 12, lineHeight: 16, weight: 600 },
  // A result card's verdict: met or not met, then what the rule needs
  cardStatus: { font: "sans", size: 14, lineHeight: 20, weight: 400 },
  // A capital's rank, in its round badge in the ranking
  rank: { font: "sans", size: 11, lineHeight: 14, weight: 600 },
  // A capital's name in its label on the Home map
  mapLabel: { font: "serif", size: 18, lineHeight: 22, weight: 600 },
  // A capital's name under its outline on the Home map, drawn on the map
  // with a halo in the paper's colour
  mapName: {
    font: "sans",
    size: 11,
    lineHeight: 11,
    weight: 600,
    letterSpacing: 0.02,
  },
  // The pulse's tag and the map's hints, in Ink pills
  tag: { font: "sans", size: 13, lineHeight: 20, weight: 600 },
  // A key in the map's key hint ("Tab", "Enter")
  keyCap: { font: "sans", size: 12, lineHeight: 16, weight: 600 },
  // The figures 0 to 3 in the legend's result chips
  legendFigure: { font: "sans", size: 10, lineHeight: 10, weight: 700 },
  // The map's attribution, bottom left
  attribution: { font: "sans", size: 12, lineHeight: 16, weight: 400 },
  // The distance of the map's scale bar, bottom right
  scaleBar: { font: "sans", size: 12, lineHeight: 14, weight: 600 },
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
  key: 3, // swatches of the ranking's key
  bar: 4, // segments of the ranking's bars
  tab: 11, // the open tab, inside its 4 px track
  scaleBar: 10, // the map's scale bar
  row: 12, // rows of the ranking and the lists, the quiet button
  control: 14, // buttons, chips, cards, fields, the tab track, the guide
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

/** A cubic Bézier curve, as the four numbers of CSS's `cubic-bezier()` */
export type Curve = readonly [x1: number, y1: number, x2: number, y2: number]

/**
 * A spring: how long it takes to settle, in milliseconds, and how far it
 * overshoots its target on the way, as a fraction of the distance travelled
 */
export type SpringToken = {
  kind: "spring"
  duration: number
  overshoot: number
}

/**
 * A tween along a curve, in milliseconds. Some tokens span a range: the
 * duration is the usual one and `longest` the upper end, for longer moves.
 */
export type EasedToken = {
  kind: "eased"
  duration: number
  longest?: number
  curve: Curve
}

export type MotionToken = SpringToken | EasedToken

/**
 * Springs are for what the visitor touches and for things arriving; the map
 * glides with no overshoot; what is left behind sinks. Durations of springs
 * are the time they take to settle within 0.2% of their target.
 */
export const motionTokens = {
  // The hovered or chosen thing rising (2–3 px on the map, 1–2 px in the
  // panel, with no shadow there)
  lift: { kind: "spring", duration: 520, overshoot: 0.04 },
  // A pressed button, chip, tab, link (1.04 × 0.94) or list row (1.01 ×
  // 0.94) squashing, held while pressed; the Press spring brings it back
  squashHeld: { kind: "eased", duration: 80, curve: [0.3, 0.7, 0.4, 1] },
  // A clicked capital or building on the map (from step 15) wobbling once:
  // wider and flatter, then the other way, then at rest, along one curve
  squash: { kind: "eased", duration: 340, curve: [0.3, 0.7, 0.4, 1] },
  // One ring spreading from the click point and fading
  ring: { kind: "eased", duration: 700, curve: [0.15, 0.7, 0.3, 1] },
  // Buttons and chips springing back after a press
  press: { kind: "spring", duration: 370, overshoot: 0.04 },
  // Camera moves, the city growing into place
  glide: { kind: "eased", duration: 760, curve: [0.33, 0, 0.15, 1] },
  // The ranking's highlight following the pointer or the keyboard from row
  // to row: Glide's curve, with no overshoot, about half as long
  follow: { kind: "eased", duration: 400, curve: [0.33, 0, 0.15, 1] },
  // Capitals or cities left behind dropping, shrinking and fading, rippling
  // outwards from the chosen one
  sink: {
    kind: "eased",
    duration: 480,
    longest: 760,
    curve: [0.55, 0, 0.75, 0.3],
  },
  // Buildings, trees, facades and icons appearing, in two or three waves
  pop: { kind: "spring", duration: 480, overshoot: 0.03 },
  // Sight lines, the walking route and outlines being drawn
  draw: {
    kind: "eased",
    duration: 600,
    longest: 1100,
    curve: [0.45, 0, 0.55, 1],
  },
  // Spotlight veil, legends, canopy, the 500 m circle
  fade: {
    kind: "eased",
    duration: 320,
    longest: 360,
    curve: [0.4, 0, 0.2, 1],
  },
  // Panel content rising into place, the guide and the pulse's tag arriving
  float: { kind: "spring", duration: 650, overshoot: 0.03 },
  // The guide's pointer and the pulse's dot tapping once and sending out a
  // ring, then resting, in a 3 s cycle
  nudge: { kind: "eased", duration: 3000, curve: [0, 0, 0.58, 1] },
} as const satisfies Record<string, MotionToken>

/** The distances and steps that go with the motion tokens */
export const motionDetails = {
  // Rise of a hovered row, chip or button in the panel, in pixels (Lift)
  liftPanel: 2,
  // Rise of a hovered or chosen thing on the map, in pixels (Lift)
  liftMap: 3,
  // Shape of a pressed button, chip, tab or link, held while pressed
  // (Squash held)
  squashHeldScale: { x: 1.04, y: 0.94 },
  // Shape of a pressed list row and its highlight, held while pressed: a
  // full-width row grows by about as many pixels as a button (Squash held)
  squashRowScale: { x: 1.01, y: 0.94 },
  // The shapes a clicked capital or building passes through, at these parts
  // of its wobble (Squash)
  squashKeyframes: {
    times: [0, 0.3, 0.6, 1],
    x: [1, 1.06, 0.976, 1],
    y: [1, 0.931, 1.03, 1],
  },
  // Scale of the click ring as it spreads, and its starting opacity (Ring)
  ringScale: { from: 0.2, to: 1.5 },
  ringOpacity: 0.9,
  // How far and how fast what is left behind drops (Sink)
  sinkDrop: 7,
  sinkRipple: 300,
  // Delay between the waves of things popping in (Pop)
  popWaves: { count: 3, apart: 120 }, // 110–140 ms apart
  // Panel content: leaving content fades out, then the new content rises
  // into place in up to three parts (Float)
  floatRise: 8,
  floatParts: 3,
  floatApart: 50,
  floatExit: { duration: 160, curve: [0.4, 0, 1, 1] as Curve },
  // The tap of the guide's pointer and the pulse's dot (Nudge)
  nudgeTap: [1, 0.82, 1.08, 1],
  nudgeTapTimes: [0, 0.06, 0.14, 0.22],
  // The ring sent out with each tap: it appears in the first 8% of the
  // cycle and has spread and faded by 55%, then rests (Nudge)
  nudgeRingScale: { from: 0.35, to: 1.9 },
  nudgeRingOpacity: 0.9,
  nudgeRingTimes: { shown: 0.08, gone: 0.55 },
  // The first tap waits for the guide to float into place, in milliseconds
  nudgeDelay: 800,
  // The map's pulse sends out two rings with each tap, the second this long
  // after the first, in milliseconds (Nudge)
  nudgeRingApart: 350,
  // Under reduced motion, the pulse keeps one still, faint ring, at this
  // scale and opacity
  pulseStillRing: { scale: 1.3, opacity: 0.5 },
  // The guide nudges this many times each time its step changes (on first
  // show too), then rests until the next change
  nudgeCount: 3,
  // Under reduced motion, every animation arrives as a fade of at most this
  // long, in milliseconds
  reducedFade: 280,
} as const
