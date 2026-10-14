/*
 * The A–Z list section of the kit page: Home's tabs with the stand-in
 * release, to try with the mouse and the keyboard, then the search field and
 * the A–Z rows held still in each state, light and dark, with the
 * reduced-motion switch. Development only; its explanatory text is not
 * translated, the list's own text comes from the messages.
 */
import messages from "@messages/en.json"
import { Fragment, useState, type ReactNode } from "react"
import { IntlProvider, useTranslations } from "use-intl"

import { AzList } from "@/components/az-list/az-list"
import { AzRows } from "@/components/az-list/az-rows"
import { HomeTabsView } from "@/components/home/home-tabs"
import { SearchField } from "@/components/ui/search-field"
import { capitalsSchema, rankingSchema } from "@/data/schemas"
import { motionDetails } from "@/design/tokens"
import { timeZone } from "@/i18n/locales"
import { azList } from "@/lib/az-list"
import type { HomeTab } from "@/lib/home-search"
import capitalsFile from "@fixtures/release/capitals.json"
import rankingFile from "@fixtures/release/ranking.json"
import { ReducedMotionSwitch } from "./kit-motion"
import { ThemePair } from "./kit-theme"

const ranking = rankingSchema.parse(rankingFile)
const { capitals } = capitalsSchema.parse(capitalsFile)

// Amsterdam, Athens and Berlin, as in the reference's UI kit
const firstRows = azList(capitals, "en").slice(0, 3)
const secondRow = firstRows[1]

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

/* A state held still: the row at the shape of its squash (Squash held) */
function Squashed({ children }: { children: ReactNode }) {
  const { x, y } = motionDetails.squashRowScale
  return <div style={{ transform: `scale(${x}, ${y})` }}>{children}</div>
}

/** Home's tabs, with the tab open kept here rather than in the address */
function TabsSample() {
  const [tab, setTab] = useState<HomeTab>("ranking")

  return (
    <HomeTabsView
      tab={tab}
      onTabChange={setTab}
      ranking={ranking}
      capitals={capitals}
    />
  )
}

/** The search field alone, empty until something is typed in it */
function EmptyField() {
  const t = useTranslations("home.az")
  const [search, setSearch] = useState("")

  return (
    <SearchField
      label={t("search")}
      clearLabel={t("clear")}
      value={search}
      onValueChange={setSearch}
    />
  )
}

export function AzKit() {
  return (
    <IntlProvider locale="en" messages={messages} timeZone={timeZone}>
      <section
        id="az-list"
        aria-labelledby="az-list-title"
        className="flex flex-col gap-7 rounded-panel border border-line bg-surface px-8 py-7"
      >
        <div className="flex flex-col gap-2">
          <h2 id="az-list-title" className="font-serif text-title">
            A–Z list
          </h2>
          <p className="max-w-190 text-small text-ink-2">
            Home&apos;s tabs (Ranking, A–Z list) with the stand-in release, and
            the A–Z list: a search field (&ldquo;Find a capital or a
            country&rdquo;) and one row per capital, in alphabetical order in
            the visitor&apos;s language, with its outline and its country. No
            bars: this tab is for finding a city. The search also finds local
            names (København, Αθήνα) and countries, and ignores accents and
            case: &ldquo;Kobenhavn&rdquo; finds Copenhagen.
          </p>
        </div>

        <ReducedMotionSwitch />

        <Cell
          title="Tabs · Home"
          note={
            <>
              Choose a tab with the mouse, or with the arrow keys then Enter:
              its content floats up 8 px into place (Float); under reduced
              motion, it fades in. On the site the tab open is in the address
              (?tab=az); here it is kept by the sample. Shown at the
              panel&apos;s width (416 px).
            </>
          }
        >
          <ThemePair>
            <div className={panelWidth}>
              <TabsSample />
            </div>
          </ThemePair>
        </Cell>

        <Cell
          title="Search field · states"
          note={
            <>
              A 48 px Surface 2 field with a hairline. Focused, its edge turns
              Ink and it takes the 2 px Ink focus ring (the reference drew a
              soft halo instead). Once something is typed, a quiet button clears
              it (Escape does too); the list narrows at once, with no motion.
              When nothing matches, the list says so, with the search. Screen
              readers hear the count found once typing pauses.
            </>
          }
        >
          <ThemePair>
            <States
              rows={[
                ["Empty", <EmptyField key="empty" />],
                [
                  "Typing",
                  <AzList
                    key="typing"
                    capitals={capitals}
                    defaultSearch="Kob"
                    data-force-focus
                  />,
                ],
                [
                  "No match",
                  <AzList
                    key="no-match"
                    capitals={capitals}
                    defaultSearch="qx"
                  />,
                ],
              ]}
            />
          </ThemePair>
        </Cell>

        <Cell
          title="A–Z rows · states"
          note={
            <>
              Rows respond like the ranking&apos;s: highlighted (Surface 2, a
              hairline, the outline edged in Ink) under the pointer or in
              keyboard focus, the highlight following from row to row (Follow);
              rows do not rise. Focus adds the 2 px Ink focus ring, for the
              keyboard only. Pressed: the row at the height of its squash.
            </>
          }
        >
          <ThemePair>
            <States
              rows={[
                ["Rest", <AzRows key="rest" entries={firstRows} />],
                [
                  "Highlighted",
                  <AzRows
                    key="highlighted"
                    entries={firstRows}
                    highlighted={secondRow.capital.slug}
                  />,
                ],
                [
                  "Focus",
                  <AzRows
                    key="focus"
                    entries={[secondRow]}
                    highlighted={secondRow.capital.slug}
                    rowProps={{
                      [secondRow.capital.slug]: { "data-force-focus": true },
                    }}
                  />,
                ],
                [
                  "Pressed",
                  <Squashed key="pressed">
                    <AzRows
                      entries={[secondRow]}
                      highlighted={secondRow.capital.slug}
                    />
                  </Squashed>,
                ],
              ]}
            />
          </ThemePair>
        </Cell>
      </section>
    </IntlProvider>
  )
}
