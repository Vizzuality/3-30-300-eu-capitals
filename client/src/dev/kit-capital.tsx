/*
 * The Capital page section of the kit page: the header of a capital's page
 * and its Other capitals, with the stand-in release, to try with the mouse
 * and the keyboard, then the rows of Other capitals held still in each
 * state, light and dark, with the reduced-motion switch. Development only;
 * its explanatory text is not translated, the page's own text comes from the
 * messages.
 */
import messages from "@messages/en.json"
import { Fragment, type ReactNode } from "react"
import { IntlProvider } from "use-intl"

import { CapitalHeader } from "@/components/capital/capital-header"
import { OtherCapitals } from "@/components/capital/other-capitals"
import { RankingList } from "@/components/ranking/ranking-list"
import { capitalsSchema, rankingSchema, summarySchema } from "@/data/schemas"
import { timeZone } from "@/i18n/locales"
import { cn } from "@/lib/utils"
import capitalsFile from "@fixtures/release/capitals.json"
import stockholmFile from "@fixtures/release/capitals/stockholm/summary.json"
import vallettaFile from "@fixtures/release/capitals/valletta/summary.json"
import rankingFile from "@fixtures/release/ranking.json"
import { ReducedMotionSwitch } from "./kit-motion"
import { ThemePair } from "./kit-theme"

const ranking = rankingSchema.parse(rankingFile)
const { capitals } = capitalsSchema.parse(capitalsFile)
const stockholm = summarySchema.parse(stockholmFile)
// The last capital: none of its residents meet all three rules
const valletta = summarySchema.parse(vallettaFile)

const first = ranking.capitals[0]
const last = ranking.capitals.at(-1) ?? first
// The capital ranked just above Stockholm
const above =
  ranking.capitals[
    ranking.capitals.findIndex(({ slug }) => slug === stockholm.slug) - 1
  ] ?? first

// The panel's width on desktop (416 px)
const panelWidth = "w-full max-w-104"

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

/** One sample per state: its name, then the sample in that state */
function States({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[84px_minmax(0,1fr)] items-start gap-x-4 gap-y-5">
      {rows.map(([name, sample]) => (
        <Fragment key={name}>
          <dt className="pt-2 text-small text-ink-2">{name}</dt>
          <dd className={panelWidth}>{sample}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

export function CapitalKit() {
  return (
    <IntlProvider locale="en" messages={messages} timeZone={timeZone}>
      <section
        id="capital"
        aria-labelledby="capital-title"
        className="flex flex-col gap-7 rounded-panel border border-line bg-surface px-8 py-7"
      >
        <div className="flex flex-col gap-2">
          <h2 id="capital-title" className="font-serif text-title">
            Capital page
          </h2>
          <p className="max-w-190 text-small text-ink-2">
            The header of a capital&apos;s page and its Other capitals, with the
            stand-in release. The header: &ldquo;All capitals&rdquo; (back to
            the ranking on Home), the capital&apos;s name (the page&apos;s h1),
            its country and residents (rounded to three significant digits, in
            millions from one million), the share of its residents meeting all
            three rules, rounded to a whole percent, its bar and the key with
            each share. Screen readers hear the share, the bar and the key as
            one sentence, as in the ranking&apos;s rows.
          </p>
        </div>

        <ReducedMotionSwitch />

        <Cell
          title="Header"
          note={
            <>
              Stockholm, then Valletta, the last capital: none of its residents
              meet all three rules, so its bar has no segment for them and its
              key reads &ldquo;all 3 · 0%&rdquo;. The key gives every share,
              rounded to a whole percent, and wraps when a language needs it.
              &ldquo;All capitals&rdquo; is the quiet button: it lifts on hover,
              and pressing it squashes it and sends out a ring (its states are
              in Buttons · in the panel). The header arrives with the
              page&apos;s content, as its first part (Float).
            </>
          }
        >
          <ThemePair>
            <div className={cn(panelWidth, "flex flex-col gap-10")}>
              <CapitalHeader summary={stockholm} />
              <CapitalHeader summary={valletta} />
            </div>
          </ThemePair>
        </Cell>

        <Cell
          title="Other capitals · Stockholm"
          note={
            <>
              The capital with the capitals ranked just above and just below it,
              muted: only its own bar keeps its full colours. Its row is
              highlighted at rest, in semibold, and is not a link. Hover the
              other rows, or reach them with Tab: the highlight follows in 400
              ms (Follow) and comes back to the capital when the pointer or the
              focus leaves; rows do not rise. Pressing a row squashes it and its
              background together while held, with a ring, like a button, and
              opens its capital. &ldquo;All 27&rdquo; is a text link, back to
              the ranking on Home; it does not move. Under reduced motion the
              highlight fades in on its row.
            </>
          }
        >
          <ThemePair>
            <div className={panelWidth}>
              <OtherCapitals
                slug={stockholm.slug}
                ranking={ranking}
                capitals={capitals}
              />
            </div>
          </ThemePair>
        </Cell>

        <Cell
          title="Other capitals · states"
          note={
            <>
              The first and the last capital take the two closest. Highlighted:
              the row under the pointer, or in keyboard focus, which adds the 2
              px Ink focus ring. Pressed: shown at rest, as wide as the Focus
              row; a press squashes the row and its background together while
              held, with a ring, like a button.
            </>
          }
        >
          <ThemePair>
            <States
              rows={[
                [
                  "First",
                  <OtherCapitals
                    key="first"
                    slug={first.slug}
                    ranking={ranking}
                    capitals={capitals}
                  />,
                ],
                [
                  "Last",
                  <OtherCapitals
                    key="last"
                    slug={last.slug}
                    ranking={ranking}
                    capitals={capitals}
                  />,
                ],
                [
                  "Highlighted",
                  <OtherCapitals
                    key="highlighted"
                    slug={stockholm.slug}
                    ranking={ranking}
                    capitals={capitals}
                    highlighted={above.slug}
                  />,
                ],
                [
                  "Focus",
                  <OtherCapitals
                    key="focus"
                    slug={stockholm.slug}
                    ranking={ranking}
                    capitals={capitals}
                    highlighted={above.slug}
                    rowProps={{ [above.slug]: { "data-force-focus": true } }}
                  />,
                ],
                [
                  "Pressed",
                  <RankingList
                    key="pressed"
                    rows={[above]}
                    capitals={capitals}
                    current={stockholm.slug}
                    highlighted={above.slug}
                  />,
                ],
              ]}
            />
          </ThemePair>
        </Cell>
      </section>
    </IntlProvider>
  )
}
