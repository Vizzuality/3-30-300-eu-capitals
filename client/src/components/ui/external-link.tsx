import type { ComponentProps, ReactNode } from "react"

import { externalRel } from "@/lib/site-links"

/**
 * A link that leaves the site: it opens in the same tab, like every other
 * link, and says it leads to another site
 */
export function ExternalLink({
  children,
  ...props
}: Omit<ComponentProps<"a">, "rel">) {
  return (
    <a rel={externalRel} {...props}>
      {children}
    </a>
  )
}

/**
 * The tag of a message whose words link to `href` outside the site
 * (`Made by <link>Vizzuality</link>`)
 */
export function externalLinkTag(href: string, className: string) {
  return function linkTag(chunks: ReactNode) {
    return (
      <ExternalLink href={href} className={className}>
        {chunks}
      </ExternalLink>
    )
  }
}
