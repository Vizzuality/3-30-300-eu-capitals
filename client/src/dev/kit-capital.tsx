/*
 * The Capital page section of the kit page: the header of a capital's page,
 * its middle block and its Other capitals, with the stand-in release, to try
 * with the mouse and the keyboard, then the middle block and the rows of
 * Other capitals held still in each state, light and dark, with the
 * reduced-motion switch. Development only; its explanatory text is not
 * translated, the page's own text comes from the messages.
 */
import messages from "@messages/en.json"
import { Fragment, useState, type ReactNode } from "react"
import { IntlProvider } from "use-intl"

import { CapitalHeader } from "@/components/capital/capital-header"
import { MiddleBlock } from "@/components/capital/middle-block"
import {
  FacadeCard,
  RuleResultCard,
  RuleSwitcher,
} from "@/components/capital/selected-building"
import { OtherCapitals } from "@/components/capital/other-capitals"
import { RankingList } from "@/components/ranking/ranking-list"
import { Button } from "@/components/ui/button"
import { capitalsSchema, rankingSchema, summarySchema } from "@/data/schemas"
import { timeZone } from "@/i18n/locales"
import type { SelectedBuilding } from "@/lib/building"
import type { CapitalView } from "@/lib/capital-view"
import type { Rule } from "@/lib/rules"
import { cn } from "@/lib/utils"
import capitalsFile from "@fixtures/release/capitals.json"
import stockholmFile from "@fixtures/release/capitals/stockholm/summary.json"
import vallettaFile from "@fixtures/release/capitals/valletta/summary.json"
import rankingFile from "@fixtures/release/ranking.json"
import {
  green,
  nearPark,
  southern,
  touching,
  unnamedPark,
  unreachable,
} from "./kit-buildings"
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

const facadeOf = (selected: SelectedBuilding, id: number) => {
  const facade = selected.facades.find((item) => item.id === id)
  if (!facade) {
    throw new Error(`Facade ${id} is not one of building ${selected.id}`)
  }
  return facade
}

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
          title="Middle block · try it"
          note={
            <>
              A real building of Stockholm, as{" "}
              <code>?building=31947&amp;at=…</code> opens it. Choose a rule with
              a click, or reach the switcher with Tab and choose with the arrow
              keys (no squash) or Space; the chosen chip has the 2 px Ink edge
              and the card swaps: the old one fades out in 160 ms, then the new
              one floats up 8 px (Float). Pressing a chip or the close button
              squashes it while held, with a ring (Squash held, Ring, Press).
              Close (or Escape on the page) returns to the street: the block
              swaps the same way; a button brings the building back. Under
              reduced motion every swap is a fade.
            </>
          }
        >
          <ThemePair>
            <div className={panelWidth}>
              <MiddleBlockDemo />
            </div>
          </ThemePair>
        </Cell>

        <Cell
          title="Middle block · views"
          note={
            <>
              The city overview: what the map shows, and the share of residents
              meeting each rule, each a whole percent (Stockholm). At street
              level, one sentence. Opened from an address: the overview by
              default, the street with <code>?at=</code> narrower than 1.5 km, a
              building with <code>?building=</code> in that area.
            </>
          }
        >
          <ThemePair>
            <States
              rows={[
                [
                  "Overview",
                  <KitMiddleBlock key="overview" view={{ view: "overview" }} />,
                ],
                [
                  "Street",
                  <KitMiddleBlock key="street" view={{ view: "street" }} />,
                ],
              ]}
            />
          </ThemePair>
        </Cell>

        <Cell
          title="Middle block · selected building"
          note={
            <>
              Its residents (a whole number, &ldquo;fewer than one&rdquo; under
              half a resident), the close button and the switcher, each chip met
              (a tick) or not met (a dash), then the card of the rule shown. The
              share seeing 3 trees is rounded up and the canopy down, so a card
              never contradicts its verdict.
            </>
          }
        >
          <ThemePair>
            <States
              rows={[
                [
                  "Rule 3",
                  <KitMiddleBlock
                    key="3"
                    view={{ view: "building", building: southern, rule: 3 }}
                  />,
                ],
                [
                  "Rule 30",
                  <KitMiddleBlock
                    key="30"
                    view={{ view: "building", building: southern, rule: 30 }}
                  />,
                ],
                [
                  "Rule 300",
                  <KitMiddleBlock
                    key="300"
                    view={{ view: "building", building: southern, rule: 300 }}
                  />,
                ],
                [
                  "Facade",
                  <KitMiddleBlock
                    key="facade"
                    view={{
                      view: "building",
                      building: southern,
                      rule: 3,
                      facade: facadeOf(southern, 102293),
                    }}
                  />,
                ],
              ]}
            />
          </ThemePair>
        </Cell>

        <Cell
          title="Switcher and cards · met and not met"
          note={
            <>
              The switcher of a building meeting all three rules, then every
              card met and not met: a facade that sees 3 trees or more and one
              that does not; a park without a name (&ldquo;the nearest
              park&rdquo;), a building next to a green space, and one with no
              path to a park. A park&apos;s name is marked in Swedish (
              <code>lang=&quot;sv&quot;</code>).
            </>
          }
        >
          <ThemePair>
            <States
              rows={[
                ["All met", <KitSwitcher key="all" building={green} />],
                ["None met", <KitSwitcher key="none" building={unreachable} />],
                ["3 · met", <KitCard key="3m" building={green} rule={3} />],
                [
                  "3 · not met",
                  <KitCard key="3n" building={nearPark} rule={3} />,
                ],
                [
                  "Facade · met",
                  <FacadeCard key="fm" facade={facadeOf(southern, 102293)} />,
                ],
                [
                  "Facade · not",
                  <FacadeCard key="fn" facade={facadeOf(southern, 102281)} />,
                ],
                ["30 · met", <KitCard key="30m" building={green} rule={30} />],
                [
                  "30 · not met",
                  <KitCard key="30n" building={southern} rule={30} />,
                ],
                [
                  "300 · met",
                  <KitCard key="300m" building={nearPark} rule={300} />,
                ],
                [
                  "300 · not met",
                  <KitCard key="300n" building={southern} rule={300} />,
                ],
                [
                  "300 · unnamed",
                  <KitCard key="300u" building={unnamedPark} rule={300} />,
                ],
                [
                  "300 · next to",
                  <KitCard key="300t" building={touching} rule={300} />,
                ],
                [
                  "300 · no path",
                  <KitCard key="300x" building={unreachable} rule={300} />,
                ],
              ]}
            />
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

const noop = () => undefined

/** The middle block held in one state */
function KitMiddleBlock({ view }: { view: CapitalView }) {
  return (
    <MiddleBlock
      view={view}
      shares={stockholm.shares.rules}
      language={stockholm.language}
      onRuleChange={noop}
      onClose={noop}
    />
  )
}

/** The middle block to try: the switcher, the close button and back */
function MiddleBlockDemo() {
  const [rule, setRule] = useState<Rule>(3)
  const [open, setOpen] = useState(true)

  return (
    <div className="flex flex-col items-start gap-4">
      <div className="w-full">
        <MiddleBlock
          view={
            open
              ? { view: "building", building: southern, rule }
              : { view: "street" }
          }
          shares={stockholm.shares.rules}
          language={stockholm.language}
          onRuleChange={setRule}
          onClose={() => {
            setOpen(false)
            setRule(3)
          }}
        />
      </div>
      {!open && (
        <Button onClick={() => setOpen(true)}>Select the building again</Button>
      )}
    </div>
  )
}

/** The switcher alone, its chips' marks as the building's results */
function KitSwitcher({ building }: { building: SelectedBuilding }) {
  const [rule, setRule] = useState<Rule>(3)
  return <RuleSwitcher building={building} rule={rule} onRuleChange={setRule} />
}

/** The card of one rule, for the whole building */
function KitCard({
  building,
  rule,
}: {
  building: SelectedBuilding
  rule: Rule
}) {
  return (
    <RuleResultCard
      building={building}
      rule={rule}
      language={stockholm.language}
    />
  )
}
