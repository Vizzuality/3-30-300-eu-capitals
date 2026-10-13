import { createCn } from "cn/config"

import { radii, shadows, spacing, typeScale } from "@/design/tokens"
import { toCssName } from "@/design/tokens-css"

const names = (scale: object) => Object.keys(scale).map(toCssName)

/**
 * Joins class names and resolves Tailwind conflicts (the last one wins). It
 * knows the design's own text sizes, radii, shadows and sizes, so `text-control`
 * is a size, not a colour that `text-ink` would replace.
 */
export const cn = createCn({
  extend: {
    theme: {
      text: names(typeScale),
      radius: names(radii),
      shadow: names(shadows),
      spacing: names(spacing),
    },
  },
})
