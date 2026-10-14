/*
 * The Ranking section of the kit page: the ranking of Home with the stand-in
 * release, to try with the mouse and the keyboard, then its rows held still in
 * each state, light and dark, with the reduced-motion switch. Development
 * only; its explanatory text is not translated, the ranking's own text comes
 * from the messages.
 */
import messages from "@messages/en.json"
import { Fragment, type ReactNode } from "react"
import { IntlProvider } from "use-intl"

import { Ranking } from "@/components/ranking/ranking"
import { RankingList } from "@/components/ranking/ranking-list"
import { capitalsSchema, rankingSchema } from "@/data/schemas"
import { timeZone } from "@/i18n/locales"
import capitalsFile from "@fixtures/release/capitals.json"
import rankingFile from "@fixtures/release/ranking.json"
import { ReducedMotionSwitch } from "./kit-motion"
import { ThemePair } from "./kit-theme"

const ranking = rankingSchema.parse(rankingFile)
const { capitals } = capitalsSchema.parse(capitalsFile)

// The podium and the two rows after it, as in the reference's UI kit
const firstRows = ranking.capitals.slice(0, 5)
const secondRow = ranking.capitals[1]

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

/** One sample per state: its name, then the rows in that state */
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

export function RankingKit() {
  return (
    <IntlProvider locale="en" messages={messages} timeZone={timeZone}>
      <section
        id="ranking"
        aria-labelledby="ranking-title"
        className="flex flex-col gap-7 rounded-panel border border-line bg-surface px-8 py-7"
      >
        <div className="flex flex-col gap-2">
          <h2 id="ranking-title" className="font-serif text-title">
            Ranking
          </h2>
          <p className="max-w-190 text-small text-ink-2">
            The ranking of Home, with the stand-in release: a sentence instead
            of a header (who leads, and about how many in 10 of its residents
            meet all three rules), the key in words, then one row per capital:
            its rank in a round badge (the top three filled, like a small
            podium), its outline, its name, its bar (all 3, 2, 1 or no rules,
            always in that order, 2 px apart; a share of zero has no segment)
            and the share meeting all three rules, rounded to a whole percent.
            Each row is a link to its capital.
          </p>
        </div>

        <ReducedMotionSwitch />

        <Cell
          title="Ranking · Home"
          note={
            <>
              Hover the rows, or reach them with Tab: the highlight (Surface 2,
              a hairline, the outline edged in Ink) follows from row to row in
              400 ms (Follow). Rows do not rise on hover. Pressing a row
              squashes it and its background together while held, with a ring,
              like a button, and opens its capital. Under reduced motion nothing
              moves: the highlight fades in on its row. On phones (below 1024 px
              wide), the bar and the number take less room. Shown at the
              panel&apos;s width (416 px).
            </>
          }
        >
          <ThemePair>
            <div className={panelWidth}>
              <Ranking ranking={ranking} capitals={capitals} />
            </div>
          </ThemePair>
        </Cell>

        <Cell
          title="Rows · states"
          note={
            <>
              Highlighted: the row under the pointer, the capital under the
              pointer on the map (from step 15), or a row in keyboard focus;
              rows do not rise. Focus adds the 2 px Ink focus ring, for the
              keyboard only. Pressed: shown at rest, as wide as the Focus row; a
              press squashes the row and its background together while held,
              with a ring, like a button.
            </>
          }
        >
          <ThemePair>
            <States
              rows={[
                [
                  "Rest",
                  <RankingList
                    key="rest"
                    rows={firstRows}
                    capitals={capitals}
                  />,
                ],
                [
                  "Highlighted",
                  <RankingList
                    key="highlighted"
                    rows={firstRows}
                    capitals={capitals}
                    highlighted={secondRow.slug}
                  />,
                ],
                [
                  "Focus",
                  <RankingList
                    key="focus"
                    rows={[secondRow]}
                    capitals={capitals}
                    highlighted={secondRow.slug}
                    rowProps={{
                      [secondRow.slug]: { "data-force-focus": true },
                    }}
                  />,
                ],
                [
                  "Pressed",
                  <RankingList
                    key="pressed"
                    rows={[secondRow]}
                    capitals={capitals}
                    highlighted={secondRow.slug}
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
