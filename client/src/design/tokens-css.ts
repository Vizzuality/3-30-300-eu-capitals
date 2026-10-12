import {
  breakpoints,
  colors,
  fonts,
  radii,
  serifVariationSettings,
  shadows,
  spacing,
  typeScale,
  type ThemeColor,
} from "./tokens.ts"

/** `surface2` → `surface-2`, `resultMuted0` → `result-muted-0` */
export function toCssName(key: string) {
  return key.replace(/([a-z])([A-Z0-9])/g, "$1-$2").toLowerCase()
}

const rem = (px: number) => `${px / 16}rem`
const px = (value: number) => `${value}px`
const fontFamily = (stack: ReadonlyArray<string>) =>
  stack.map((name) => (name.includes(" ") ? `"${name}"` : name)).join(", ")

function declarations(entries: Array<[string, string]>, indent: string) {
  return entries.map(([name, value]) => `${indent}--${name}: ${value};`)
}

function themeValues(theme: keyof ThemeColor) {
  return [
    ...Object.entries(colors).map(([key, color]): [string, string] => [
      toCssName(key),
      color[theme],
    ]),
    ...Object.entries(shadows).map(([key, shadow]): [string, string] => [
      toCssName(key),
      shadow[theme],
    ]),
  ]
}

/*
 * Tailwind's theme. Sizes of text are in rem, so text grows with the
 * visitor's text size; the layout's sizes stay in pixels.
 */
function themeVariables(): Array<[string, string]> {
  return [
    ["font-serif", fontFamily(fonts.serif)],
    ["font-serif--font-variation-settings", serifVariationSettings],
    ["font-sans", fontFamily(fonts.sans)],
    ...Object.entries(typeScale).flatMap(([key, style]) => {
      const name = `text-${toCssName(key)}`
      const entries: Array<[string, string]> = [
        [name, rem(style.size)],
        [`${name}--line-height`, rem(style.lineHeight)],
        [`${name}--font-weight`, String(style.weight)],
      ]
      if ("letterSpacing" in style) {
        entries.push([`${name}--letter-spacing`, `${style.letterSpacing}em`])
      }
      return entries
    }),
    ...Object.entries(radii).map(([key, value]): [string, string] => [
      `radius-${toCssName(key)}`,
      px(value),
    ]),
    ...Object.entries(spacing).map(([key, value]): [string, string] => [
      `spacing-${toCssName(key)}`,
      px(value),
    ]),
    ...Object.entries(breakpoints).map(([key, value]): [string, string] => [
      `breakpoint-${toCssName(key)}`,
      rem(value),
    ]),
  ]
}

/**
 * The content of `tokens.css`: the colours as custom properties, switching
 * with the system's colour scheme, and Tailwind's theme. Tailwind's own
 * defaults for these namespaces are removed, so only the design's tokens
 * exist as utilities.
 */
export function tokensCss() {
  const light = themeValues("light")
  const dark = themeValues("dark")

  return [
    "/* Generated from tokens.ts by `pnpm tokens`: do not edit by hand */",
    "",
    ":root {",
    ...declarations(light, "  "),
    "}",
    "",
    "@media (prefers-color-scheme: dark) {",
    "  :root {",
    ...declarations(dark, "    "),
    "  }",
    "}",
    "",
    "@theme {",
    "  --color-*: initial;",
    "  --font-*: initial;",
    "  --text-*: initial;",
    "  --radius-*: initial;",
    "  --shadow-*: initial;",
    "  --breakpoint-*: initial;",
    "",
    ...declarations(themeVariables(), "  "),
    "}",
    "",
    "/* Colours and shadows follow the colour scheme, so utilities read them at run time */",
    "@theme inline {",
    ...declarations(
      [
        ...Object.keys(colors).map((key): [string, string] => [
          `color-${toCssName(key)}`,
          `var(--${toCssName(key)})`,
        ]),
        ...Object.keys(shadows).map((key): [string, string] => [
          `shadow-${toCssName(key)}`,
          `var(--${toCssName(key)})`,
        ]),
      ],
      "  "
    ),
    "}",
    "",
  ].join("\n")
}
