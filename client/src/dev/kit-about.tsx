/*
 * The About and footer section of the kit page: the footer, as it is today
 * and with the link to the code it gets once the code is public, then the
 * About page's back link (to each page it can be opened from) and its
 * sections, with the stand-in release's sources, light and dark.
 * Development only; its explanatory text is not translated, the page's own
 * text comes from the messages.
 */
import messages from "@messages/en.json"
import type { ReactNode } from "react"
import { IntlProvider } from "use-intl"

import {
  AboutBackLink,
  AboutLinks,
  BasedOn,
  DataCredits,
} from "@/components/about/about-content"
import { SiteFooter } from "@/components/layout/site-footer"
import { sourcesSchema } from "@/data/schemas"
import { timeZone } from "@/i18n/locales"
import { homeOrigin } from "@/lib/about-origin"
import sourcesFile from "@fixtures/release/sources.json"
import { ReducedMotionSwitch } from "./kit-motion"
import { ThemePair } from "./kit-theme"

const sources = sourcesSchema.parse(sourcesFile)

// The panel's width on desktop, without its side padding (416 px)
const panelWidth = "flex w-full max-w-104 flex-col gap-block"

function Cell({
  title,
  note,
  children,
}: {
  title: string
  note: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-control font-semibold">{title}</h3>
      {children}
      <p className="max-w-190 text-small text-ink-2">{note}</p>
    </div>
  )
}

export function AboutKit() {
  return (
    <IntlProvider locale="en" messages={messages} timeZone={timeZone}>
      <section
        id="about"
        aria-labelledby="about-title"
        className="flex flex-col gap-7 rounded-panel border border-line bg-surface px-8 py-7"
      >
        <div className="flex flex-col gap-2">
          <h2 id="about-title" className="font-serif text-title">
            About and footer
          </h2>
          <p className="max-w-190 text-small text-ink-2">
            The footer pinned at the bottom of the panel, and the blocks of the
            About page (&ldquo;About&rdquo; and the footer on the
            reference&apos;s About screen).
          </p>
        </div>

        <ReducedMotionSwitch />

        <Cell
          title="Footer"
          note={
            <>
              One line pinned at the bottom of the panel on desktop, under a
              hairline; on phones it ends the page, on Surface 2, its items one
              under the other. &ldquo;Vizzuality&rdquo; is a quiet text link, in
              Ink 2 until hovered: it does not move. The second footer shows the
              link to the code, added once the code has a public address; until
              then the footer holds &ldquo;Made by Vizzuality&rdquo; alone.
            </>
          }
        >
          <ThemePair>
            <div className="flex w-full max-w-120 flex-col gap-4">
              <SiteFooter />
              <SiteFooter code="https://example.com/code" />
            </div>
          </ThemePair>
        </Cell>

        <Cell
          title="About · back link"
          note={
            <>
              Back to the page About was opened from: Home or a capital
              (&ldquo;Back to the map&rdquo;), or Methodology. Opened directly,
              About leads to Home. The quiet button: it lifts on hover, and
              pressing it squashes it and sends out a ring, then it springs
              back.
            </>
          }
        >
          <ThemePair>
            <div className={panelWidth}>
              <AboutBackLink origin={homeOrigin} />
              <AboutBackLink
                origin={{
                  page: "capital",
                  slug: "stockholm",
                  search: { rule: 3, at: undefined },
                }}
              />
              <AboutBackLink origin={{ page: "methodology" }} />
            </div>
          </ThemePair>
        </Cell>

        <Cell
          title="About · sections"
          note={
            <>
              Based on: the two papers, each one citation that links to its DOI,
              in a hairline box that takes Surface 2 on hover (a link: it does
              not move). The data credits, from the release&apos;s sources: the
              sources named as their publishers write them, then the attribution
              each licence asks for and the licence; the OpenStreetMap sources
              share one credit, and an attribution that repeats the name is left
              out (Wikidata). Natural Earth, the Home map&apos;s countries,
              closes the list. Links: Vizzuality, a secondary button that lifts
              and squashes; the code joins it once it is public.
            </>
          }
        >
          <ThemePair>
            <div className={panelWidth}>
              <BasedOn />
              <DataCredits sources={sources} />
              <AboutLinks />
            </div>
          </ThemePair>
        </Cell>
      </section>
    </IntlProvider>
  )
}
