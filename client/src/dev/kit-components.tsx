/*
 * The Components section of the kit page: every control of the panel and of
 * the map, in each of its states, in the light and the dark theme side by
 * side. Development only; its sample text is not translated, but the names
 * the controls carry come from the messages, as on the site.
 */
import messages from "@messages/en.json"
import { Fragment, type ReactNode } from "react"
import { IntlProvider, useTranslations } from "use-intl"

import {
  ChevronLeftIcon,
  CloseIcon,
  FrameIcon,
  MinusIcon,
  PlusIcon,
} from "@/components/icons"
import { TouchLink } from "@/components/motion/touch-link"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Chip,
  ChipFigure,
  ChipGroup,
  ChipStatus,
  ChipUnit,
} from "@/components/ui/chip"
import { IconButton } from "@/components/ui/icon-button"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"
import { textLinkVariants } from "@/components/ui/text-link"
import { motionDetails } from "@/design/tokens"
import { timeZone } from "@/i18n/locales"
import { ThemePair } from "./kit-theme"

/*
 * A state held still: `data-force-hover` and `data-force-focus` give a
 * control its hover look or its focus ring at rest. The motion of the state
 * is drawn by a wrapper: the 2 px rise of Lift, or the shape at the height of
 * Squash.
 */
type Forced = { "data-force-hover"?: true; "data-force-focus"?: true }
const hover: Forced = { "data-force-hover": true }
const focus: Forced = { "data-force-focus": true }

function Lifted({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex"
      style={{ transform: `translateY(-${motionDetails.liftPanel}px)` }}
    >
      {children}
    </span>
  )
}

function Squashed({ children }: { children: ReactNode }) {
  const { x, y } = motionDetails.squashHeldScale
  return (
    <span className="inline-flex" style={{ transform: `scale(${x}, ${y})` }}>
      {children}
    </span>
  )
}

/** One sample per state: its name, then the controls in that state */
function States({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-x-4 gap-y-4">
      {rows.map(([name, sample]) => (
        <Fragment key={name}>
          <dt className="text-small text-ink-2">{name}</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-2.5">
            {sample}
          </dd>
        </Fragment>
      ))}
    </dl>
  )
}

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

function PanelButtons() {
  const t = useTranslations()
  const controls = (state: Forced = {}, disabled = false) => (
    <>
      <Button variant="quiet" disabled={disabled} {...state}>
        <ChevronLeftIcon data-icon="inline-start" />
        All capitals
      </Button>
      <Button disabled={disabled} {...state}>
        Vizzuality
      </Button>
      <IconButton
        label={t("capital.closeBuilding")}
        disabled={disabled}
        {...state}
      >
        <CloseIcon />
      </IconButton>
    </>
  )

  return (
    <Cell
      title="Buttons · in the panel"
      note={
        <>
          Quiet (no box until hovered: &ldquo;All capitals&rdquo;, &ldquo;Back
          to the map&rdquo;), secondary (a hairline box, 40 px: About&apos;s
          links, the 404 page&apos;s link home) and the round close button (40
          px). Flat: a hairline and Surface 2 on hover. Hover lifts 2 px;
          pressing squashes, sends out a ring and springs back. On phones, each
          hit area grows to 44 px without changing the look. Disabled: half
          opacity, as for the zoom buttons at their limits.
        </>
      }
    >
      <ThemePair>
        <States
          rows={[
            ["Rest", controls()],
            [
              "Hover",
              <>
                <Lifted>
                  <Button variant="quiet" {...hover}>
                    <ChevronLeftIcon data-icon="inline-start" />
                    All capitals
                  </Button>
                </Lifted>
                <Lifted>
                  <Button {...hover}>Vizzuality</Button>
                </Lifted>
                <Lifted>
                  <IconButton label={t("capital.closeBuilding")} {...hover}>
                    <CloseIcon />
                  </IconButton>
                </Lifted>
              </>,
            ],
            [
              "Pressed",
              <>
                <Squashed>
                  <Button variant="quiet">
                    <ChevronLeftIcon data-icon="inline-start" />
                    All capitals
                  </Button>
                </Squashed>
                <Squashed>
                  <Button>Vizzuality</Button>
                </Squashed>
                <Squashed>
                  <IconButton label={t("capital.closeBuilding")}>
                    <CloseIcon />
                  </IconButton>
                </Squashed>
              </>,
            ],
            ["Focus", controls(focus)],
            ["Disabled", controls({}, true)],
          ]}
        />
      </ThemePair>
    </Cell>
  )
}

function MapControls() {
  const t = useTranslations("map")
  const controls = (state: Forced = {}, zoomInDisabled = false) => (
    <>
      <Button variant="map" {...state}>
        <FrameIcon data-icon="inline-start" />
        {t("wholeCity")}
      </Button>
      <IconButton
        variant="map"
        label={t("zoomIn")}
        disabled={zoomInDisabled}
        {...state}
      >
        <PlusIcon />
      </IconButton>
      <IconButton variant="map" label={t("zoomOut")} {...state}>
        <MinusIcon />
      </IconButton>
    </>
  )
  const lifted = (
    <>
      <Lifted>
        <Button variant="map" {...hover}>
          <FrameIcon data-icon="inline-start" />
          {t("wholeCity")}
        </Button>
      </Lifted>
      <Lifted>
        <IconButton variant="map" label={t("zoomIn")} {...hover}>
          <PlusIcon />
        </IconButton>
      </Lifted>
      <Lifted>
        <IconButton variant="map" label={t("zoomOut")} {...hover}>
          <MinusIcon />
        </IconButton>
      </Lifted>
    </>
  )
  const squashed = (
    <>
      <Squashed>
        <Button variant="map">
          <FrameIcon data-icon="inline-start" />
          {t("wholeCity")}
        </Button>
      </Squashed>
      <Squashed>
        <IconButton variant="map" label={t("zoomIn")}>
          <PlusIcon />
        </IconButton>
      </Squashed>
      <Squashed>
        <IconButton variant="map" label={t("zoomOut")}>
          <MinusIcon />
        </IconButton>
      </Squashed>
    </>
  )

  return (
    <Cell
      title="Map controls · float on the map"
      note={
        <>
          &ldquo;Whole city&rdquo; (a 44 px pill, on the capital page only) and
          the zoom buttons (44 px circles, hidden on phones), with the soft
          lift, on the map&apos;s land colour. Surface 2 on hover, as for the
          other buttons (the soft lift keeps them apart from the land), and a 2
          px rise; pressing squashes, sends out a ring and springs back.
          Disabled: zoom in at the closest zoom, zoom out at the farthest.
        </>
      }
    >
      <ThemePair>
        <div className="rounded-control bg-land p-4.5">
          <States
            rows={[
              ["Rest", controls()],
              ["Hover", lifted],
              ["Pressed", squashed],
              ["Focus", controls(focus)],
              ["Disabled", controls({}, true)],
            ]}
          />
        </div>
      </ThemePair>
    </Cell>
  )
}

function KitTabs({
  state,
  labels = ["Ranking", "A–Z list"],
  lang,
}: {
  state?: Forced
  labels?: [string, string]
  lang?: string
}) {
  return (
    <Tabs defaultValue="ranking" lang={lang} className="w-full max-w-104">
      <TabsList>
        <TabsTab value="ranking">{labels[0]}</TabsTab>
        <TabsTab value="az" {...state}>
          {labels[1]}
        </TabsTab>
      </TabsList>
    </Tabs>
  )
}

function TabsSamples() {
  return (
    <Cell
      title="Tabs · Home"
      note={
        <>
          The open tab sits on Surface with a hairline, in a Surface 2 track;
          the others are in Ink 2, Ink on hover (not in the reference). The
          arrow keys move between the tabs, Home and End go to the first and the
          last, Enter or Space opens the one in focus. Pressing squashes and
          sends out a ring. Labels share the width and wrap when a language
          needs it. Shown at the panel&apos;s width (416 px).
        </>
      }
    >
      <ThemePair>
        <States
          rows={[
            ["Rest", <KitTabs key="rest" />],
            ["Hover", <KitTabs key="hover" state={hover} />],
            ["Focus", <KitTabs key="focus" state={focus} />],
            [
              "German",
              <KitTabs
                key="german"
                lang="de"
                labels={["Rangliste", "Liste von A bis Z"]}
              />,
            ],
            [
              "With panels",
              <Tabs key="panels" defaultValue="ranking" className="w-full">
                <div className="flex max-w-104 flex-col gap-3">
                  <TabsList>
                    <TabsTab value="ranking">Ranking</TabsTab>
                    <TabsTab value="az">A–Z list</TabsTab>
                  </TabsList>
                  <TabsPanel value="ranking" className="text-small text-ink-2">
                    The ranking of the 27 capitals goes here.
                  </TabsPanel>
                  <TabsPanel value="az" className="text-small text-ink-2">
                    The search and the A–Z list go here.
                  </TabsPanel>
                </div>
              </Tabs>,
            ],
          ]}
        />
      </ThemePair>
    </Cell>
  )
}

type RuleSample = {
  value: string
  figure: string
  unit: string
  met: boolean
  status: string
}

const rules: Array<RuleSample> = [
  { value: "3", figure: "3", unit: "trees", met: false, status: "not met" },
  {
    value: "30",
    figure: "30",
    unit: "% canopy",
    met: false,
    status: "not met",
  },
  {
    value: "300",
    figure: "300",
    unit: "m to a park",
    met: true,
    status: "met",
  },
]

const rulesInGerman: Array<RuleSample> = [
  {
    value: "3",
    figure: "3",
    unit: "Bäume",
    met: false,
    status: "nicht erfüllt",
  },
  {
    value: "30",
    figure: "30",
    unit: "% Baumkronen",
    met: false,
    status: "nicht erfüllt",
  },
  {
    value: "300",
    figure: "300",
    unit: "m bis zum Park",
    met: true,
    status: "erfüllt",
  },
]

function KitChips({
  states = {},
  items = rules,
  lang,
}: {
  states?: Record<string, Forced>
  items?: Array<RuleSample>
  lang?: string
}) {
  return (
    <ChipGroup
      aria-label={lang ? "Regeln" : "Rules"}
      lang={lang}
      defaultValue="3"
      className="w-full max-w-104"
    >
      {items.map(({ value, figure, unit, met, status }) => (
        <Chip key={value} value={value} {...states[value]}>
          <ChipFigure>{figure}</ChipFigure>
          <ChipUnit>{unit}</ChipUnit>
          <ChipStatus met={met}>{status}</ChipStatus>
        </Chip>
      ))}
    </ChipGroup>
  )
}

function ChipsSamples() {
  return (
    <Cell
      title="Chips · the rule switcher of a selected building"
      note={
        <>
          A radio group: one chip chosen at a time (2 px Ink edge), Surface 2 on
          hover, met (a filled tick) or not met (a dash). One Tab stop; the
          arrow keys choose the next chip, Space (or a click) chooses the chip
          in focus. Pressing squashes and sends out a ring. The rules themselves
          come with the switcher. Shown at the panel&apos;s width (416 px).
        </>
      }
    >
      <ThemePair>
        <States
          rows={[
            ["Rest", <KitChips key="rest" />],
            ["Hover", <KitChips key="hover" states={{ "30": hover }} />],
            ["Focus", <KitChips key="focus" states={{ "3": focus }} />],
            [
              "German",
              <KitChips key="german" lang="de" items={rulesInGerman} />,
            ],
          ]}
        />
      </ThemePair>
    </Cell>
  )
}

function linkSamples(state: Forced = {}) {
  return (
    <>
      <a
        href="#components"
        className={textLinkVariants({ variant: "strong" })}
        {...state}
      >
        All 27
      </a>
      <a
        href="#components"
        className={textLinkVariants({ variant: "quiet" })}
        {...state}
      >
        Data credits
      </a>
      <TouchLink
        to="/$locale"
        params={{ locale: "en" }}
        className={buttonVariants({ variant: "secondary" })}
        {...state}
      >
        Go to the home page
      </TouchLink>
    </>
  )
}

function linkInSentence(state: Forced = {}) {
  return (
    <p className="text-body">
      Every capital is measured with the{" "}
      <a
        href="#components"
        className={textLinkVariants({ variant: "inline" })}
        {...state}
      >
        same open data
      </a>{" "}
      and the same method.
    </p>
  )
}

function Links() {
  return (
    <Cell
      title="Links"
      note={
        <>
          Text links on their own (&ldquo;All 27&rdquo; in Ink; the
          footer&apos;s links in Ink 2) and in a sentence (in the text&apos;s
          size and colour, semibold; not in the reference), underlined with the
          Line colour, which turns to the text&apos;s colour on hover. They do
          not move. A link that looks like a button (the 404 page&apos;s link
          home, About&apos;s links) stays a link, with the secondary
          button&apos;s look and its motion. The top bar&apos;s links are on
          every page.
        </>
      }
    >
      <ThemePair>
        <States
          rows={[
            ["Rest", linkSamples()],
            ["Hover", linkSamples(hover)],
            ["Focus", linkSamples(focus)],
            ["In a sentence", linkInSentence()],
            ["Sentence, hover", linkInSentence(hover)],
            ["Sentence, focus", linkInSentence(focus)],
          ]}
        />
      </ThemePair>
    </Cell>
  )
}

export function ComponentsKit() {
  return (
    <IntlProvider locale="en" messages={messages} timeZone={timeZone}>
      <section
        id="components"
        aria-labelledby="components-title"
        className="flex flex-col gap-7 rounded-panel border border-line bg-surface px-8 py-7"
      >
        <div className="flex flex-col gap-2">
          <h2 id="components-title" className="font-serif text-title">
            Components
          </h2>
          <p className="max-w-190 text-small text-ink-2">
            The controls of the panel and of the map, light and dark side by
            side. Every sample is a real control: hover it, press it, or reach
            it with Tab. The Hover, Pressed and Focus rows hold that state
            still. Every control shows the same 2 px Ink focus ring, for the
            keyboard only. The reduced-motion switch of the Motion section
            applies here too.
          </p>
        </div>
        <PanelButtons />
        <MapControls />
        <TabsSamples />
        <ChipsSamples />
        <Links />
      </section>
    </IntlProvider>
  )
}
