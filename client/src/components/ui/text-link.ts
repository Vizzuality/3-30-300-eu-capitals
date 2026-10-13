import { cva } from "class-variance-authority"

import { hitTarget } from "./hit-target"

/*
 * Text links, underlined with a hairline that darkens on hover. They do not
 * move: only buttons, tabs, chips and the top bar's links respond with
 * motion. A link that looks like a button takes `buttonVariants` instead.
 */
export const textLinkVariants = cva(
  "underline decoration-line underline-offset-3 transition-colors hover:decoration-current",
  {
    variants: {
      variant: {
        // On its own, in Ink ("All 27")
        strong: ["relative py-1 text-small font-semibold text-ink", hitTarget],
        // On its own, quieter, in Ink 2 until hovered (the footer's links)
        quiet: [
          "relative py-1 text-small font-medium text-ink-2 hover:text-ink",
          hitTarget,
        ],
        // In a sentence: the text's size and colour, in semibold
        inline: "font-semibold",
      },
    },
    defaultVariants: {
      variant: "strong",
    },
  }
)
