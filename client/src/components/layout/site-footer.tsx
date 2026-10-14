import { useTranslations } from "use-intl"

import { ExternalLink, externalLinkTag } from "@/components/ui/external-link"
import { textLinkVariants } from "@/components/ui/text-link"
import { siteLinks } from "@/lib/site-links"

const quietLink = textLinkVariants({ variant: "quiet" })

/**
 * The footer: one line pinned at the bottom of the panel on desktop, the end
 * of the page on phones. Who made the site, and its code once the code has a
 * public address (`code`, the published address by default). Its links are
 * text links: they do not move.
 */
export function SiteFooter({ code = siteLinks.code }: { code?: string }) {
  const t = useTranslations("frame")

  return (
    <footer className="flex shrink-0 flex-col items-start gap-x-3 gap-y-1 bg-surface-2 px-panel-inset-phone pt-5 pb-7 text-small text-ink-2 desktop:flex-row desktop:items-center desktop:justify-between desktop:border-t desktop:border-line desktop:bg-transparent desktop:px-panel-inset desktop:pt-3 desktop:pb-3.5">
      <p>
        {t.rich("madeBy", {
          link: externalLinkTag(siteLinks.vizzuality, quietLink),
        })}
      </p>
      {code && (
        <ExternalLink href={code} className={quietLink}>
          {t("code")}
        </ExternalLink>
      )}
    </footer>
  )
}
