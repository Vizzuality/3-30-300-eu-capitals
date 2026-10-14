/*
 * The Map overlays section of the kit page: everything that floats on the
 * map, built before the map, on a plain surface standing in for it. First a
 * stand-in map to try them with the mouse and the keyboard, light and dark;
 * then each overlay held still in each of its states. Development only; its
 * explanatory text is not translated, the overlays' own text comes from the
 * messages.
 */
import messages from "@messages/en.json"
import {
  Fragment,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { IntlProvider } from "use-intl"

import { HoverLabel } from "@/components/map/hover-label"
import { KeyHint } from "@/components/map/key-hint"
import { MapAttribution } from "@/components/map/map-attribution"
import { MapBottom } from "@/components/map/map-bottom"
import { MapControls } from "@/components/map/map-controls"
import { MapLegend } from "@/components/map/map-legend"
import { overlayPlacement } from "@/components/map/placement"
import { PulseTag } from "@/components/map/pulse-tag"
import { ScaleBar } from "@/components/map/scale-bar"
import {
  TwoFingerHint,
  useTwoFingerHint,
} from "@/components/map/two-finger-hint"
import { Button } from "@/components/ui/button"
import { rankingSchema, sourcesSchema } from "@/data/schemas"
import { motionDetails } from "@/design/tokens"
import { timeZone } from "@/i18n/locales"
import { guideStates, type GuideState } from "@/lib/guide"
import type { LegendView } from "@/lib/map-legend"
import { cn } from "@/lib/utils"
import rankingFile from "@fixtures/release/ranking.json"
import sourcesFile from "@fixtures/release/sources.json"
import { ReducedMotionSwitch } from "./kit-motion"
import { ThemePair, ThemeScope } from "./kit-theme"

const { sources } = sourcesSchema.parse(sourcesFile)
const ranking = rankingSchema.parse(rankingFile)

/** The capitals labelled on the stand-in Home map, from the stand-in release */
function labelOf(slug: string) {
  const row = ranking.capitals.find((item) => item.slug === slug)
  if (!row) {
    throw new Error(`${slug} is not in the stand-in ranking`)
  }
  return {
    name: row.name.en,
    country: row.country.name.en,
    share: row.shares.met[3],
  }
}

const stockholm = labelOf("stockholm")
const first = ranking.capitals[0]
const last = ranking.capitals.at(-1) ?? first

/** The views of the map, as the kit moves through them */
type KitView =
  | "home"
  | "overview"
  | "street"
  | "building"
  | "facade"
  | "rule30"
  | "rule300"

const kitViews: Array<[KitView, string]> = [
  ["home", "Home"],
  ["overview", "City overview"],
  ["street", "Street"],
  ["building", "Selected building, rule 3"],
  ["facade", "Selected facade"],
  ["rule30", "Rule 30"],
  ["rule300", "Rule 300"],
]

const legendViews: Record<KitView, LegendView> = {
  home: { view: "home" },
  overview: { view: "overview" },
  street: { view: "street" },
  building: { view: "building", rule: 3, facade: false },
  facade: { view: "building", rule: 3, facade: true },
  rule30: { view: "building", rule: 30, facade: false },
  rule300: { view: "building", rule: 300, facade: false },
}

const guideStateOf: Record<KitView, GuideState> = {
  home: "home",
  overview: "overview",
  street: "street",
  building: "building",
  facade: "facade",
  rule30: "explore",
  rule300: "explore",
}

// Each view opens at a zoom of its own (deck.gl's, 512 px tiles); Stockholm
// lies at 59.33° north
const openingZoom: Record<KitView, number> = {
  home: 4,
  overview: 11,
  street: 16,
  building: 17,
  facade: 17,
  rule30: 15,
  rule300: 16,
}
const ZOOM_RANGE = [3, 18] as const
const LATITUDE = 59.33
const EARTH_CIRCUMFERENCE = 40_075_016.686

function metresPerPixel(zoom: number) {
  return (
    (EARTH_CIRCUMFERENCE * Math.cos((LATITUDE * Math.PI) / 180)) /
    (512 * 2 ** zoom)
  )
}

/** The size of an element, followed as it changes */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, size] as const
}

/** The pulse's dot and its faint ring, drawn by the map: a stand-in */
function StandInPulse({ x, y }: { x: number; y: number }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{ left: x, top: y }}
    >
      <span className="absolute -top-6 -left-6 size-12 scale-130 rounded-full border-2 border-ink opacity-50" />
      <span className="absolute -top-2 -left-2 size-4 rounded-full border-3 border-surface bg-ink shadow-lift" />
    </span>
  )
}

/** The stand-in capital's radius: its label points at its top */
const CAPITAL_RADIUS = 10

/** A capital on the Home map, lifted under the pointer: a stand-in */
function StandInCapital({ x, y }: { x: number; y: number }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute size-5 -translate-1/2 rounded-full border-2 border-ink bg-surface shadow-lift"
      style={{ left: x, top: y }}
    />
  )
}

function StandInMap({
  view,
  zoom,
  hovered,
  onZoom,
  onWholeCity,
}: {
  view: KitView
  zoom: number
  hovered: boolean
  onZoom: (step: number) => void
  onWholeCity: () => void
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>()
  const [focused, setFocused] = useState(false)
  const hint = useTwoFingerHint()
  const hintId = useId()
  const isHome = view === "home"
  const atStreet = !isHome && view !== "overview"
  const state = guideStateOf[view]
  // The pulse's places, from the reference's screens
  // Stockholm on the stand-in Home map
  const capitalAt = { x: width * 0.496, y: height * 0.32 }
  const pulseAt =
    view === "overview"
      ? { x: width * 0.634, y: height * 0.559 }
      : { x: width * 0.6, y: height * 0.371 }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={ref}
        data-stand-in-map={view}
        className={cn({
          "relative aspect-[960/900] w-full overflow-hidden rounded-control border border-line": true,
          "bg-europe-sea": isHome,
          "bg-land": !isHome,
        })}
      >
        {/* The map's focus stop, as the map will have it: one element that
            takes the keyboard, named and described */}
        {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */}
        <div
          role="application"
          aria-label="Stand-in map"
          aria-describedby={hintId}
          tabIndex={0}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="absolute inset-0 rounded-control focus-visible:-outline-offset-2"
        />
        {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */}
        {isHome && hovered && (
          <StandInCapital x={capitalAt.x} y={capitalAt.y} />
        )}
        {(view === "overview" || view === "street") && (
          <StandInPulse x={pulseAt.x} y={pulseAt.y} />
        )}
        <PulseTag state={state} x={pulseAt.x} y={pulseAt.y} />
        <HoverLabel
          capital={isHome && hovered ? stockholm : undefined}
          x={capitalAt.x}
          y={capitalAt.y - CAPITAL_RADIUS}
          map={{ width, height }}
        />
        <MapLegend
          view={legendViews[view]}
          className={overlayPlacement.legend}
        />
        <MapControls
          className={overlayPlacement.controls}
          onZoomIn={() => onZoom(1)}
          onZoomOut={() => onZoom(-1)}
          canZoomIn={zoom < ZOOM_RANGE[1]}
          canZoomOut={zoom > ZOOM_RANGE[0]}
          onWholeCity={isHome ? undefined : onWholeCity}
        />
        <MapBottom
          attribution={
            <MapAttribution
              map={isHome ? "home" : "capital"}
              sources={sources}
            />
          }
          scale={atStreet && <ScaleBar metresPerPixel={metresPerPixel(zoom)} />}
          keyHint={<KeyHint id={hintId} state={state} visible={focused} />}
        />
        <div className={overlayPlacement.twoFingerHint}>
          <TwoFingerHint visible={hint.visible} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={hint.show}>One-finger sideways drag</Button>
        <span className="text-small text-ink-2">
          Zoom {zoom}
          {atStreet && `, ${metresPerPixel(zoom).toPrecision(2)} m per pixel`}
        </span>
      </div>
    </div>
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

/** A choice among a few, as the reference's demo buttons */
function Choice({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      aria-pressed={pressed}
      onClick={onClick}
      className={pressed ? "border-2 border-ink px-3.75 py-2.25" : undefined}
    >
      {children}
    </Button>
  )
}

function TryIt() {
  const [view, setView] = useState<KitView>("overview")
  const [zoom, setZoom] = useState(openingZoom.overview)
  const [hovered, setHovered] = useState(true)

  const choose = (next: KitView) => {
    setView(next)
    setZoom(openingZoom[next])
  }

  return (
    <Cell
      title="Try it"
      note={
        <>
          A view chosen here is what the map will show. The zoom buttons change
          the stand-in&apos;s zoom (from 3 to 18), so the scale bar follows it;
          at either end, a button is disabled but keeps the focus. &ldquo;Whole
          city&rdquo; goes back to the city overview. Tab to the stand-in map to
          see the key hint (its description for screen readers);
          &ldquo;One-finger sideways drag&rdquo; shows the phone&apos;s hint for
          2 s. The pulse&apos;s dot is a stand-in: the map draws it. On a
          phone-sized window, the zoom buttons leave the map.
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {kitViews.map(([item, name]) => (
          <Choice
            key={item}
            pressed={item === view}
            onClick={() => choose(item)}
          >
            {name}
          </Choice>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Choice pressed={hovered} onClick={() => setHovered(!hovered)}>
          Home: Stockholm under the pointer
        </Choice>
      </div>
      <div className="grid overflow-hidden rounded-control border border-line desktop:grid-cols-2">
        {(["light", "dark"] as const).map((theme) => (
          <ThemeScope
            key={theme}
            theme={theme}
            className="flex min-w-0 flex-col gap-4 p-5"
          >
            <p className="text-label text-ink-2 uppercase">
              {theme === "light" ? "Light" : "Dark"}
            </p>
            <StandInMap
              view={view}
              zoom={zoom}
              hovered={hovered}
              onZoom={(step) =>
                setZoom((current) =>
                  Math.min(
                    Math.max(current + step, ZOOM_RANGE[0]),
                    ZOOM_RANGE[1]
                  )
                )
              }
              onWholeCity={() => choose("overview")}
            />
          </ThemeScope>
        ))}
      </div>
    </Cell>
  )
}

/** A plain surface standing in for the map */
function OnMap({
  home = false,
  className,
  children,
}: {
  home?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn({
        "rounded-control p-4.5": true,
        "bg-europe-sea": home,
        "bg-land": !home,
        [className ?? ""]: Boolean(className),
      })}
    >
      {children}
    </div>
  )
}

/** One sample per state: its name, then the sample in that state */
function States({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-x-4 gap-y-4">
      {rows.map(([name, sample]) => (
        <Fragment key={name}>
          <dt className="pt-1 text-small text-ink-2">{name}</dt>
          <dd className="min-w-0">{sample}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

function LegendStates() {
  return (
    <Cell
      title="Legend · top left"
      note={
        <>
          Each view&apos;s legend, rule by rule: one name and one swatch shape
          per thing in every view (results the 0–3 chips, trees a dot, canopy a
          soft patch, parks a rectangle, lines a short stroke, the 500 m circle
          a ring); only the colour follows the map, canopy and the park in full
          green as evidence. Home has none. On the map, a card with the soft
          lift; on phones, under the map band, without its card. When the view
          changes, the old content fades out and the new fades in (Fade). The
          figures on the chips are darker than Ink on Results 1, to reach 4.5:1.
        </>
      }
    >
      <ThemePair>
        <States
          rows={kitViews
            .filter(([view]) => view !== "home")
            .map(([view, name]) => [
              name,
              <div key={view} className="flex flex-wrap items-start gap-3">
                <OnMap>
                  <MapLegend view={legendViews[view]} />
                </OnMap>
                <div className="py-4.5">
                  <MapLegend view={legendViews[view]} variant="band" />
                </div>
              </div>,
            ])}
        />
      </ThemePair>
    </Cell>
  )
}

const noop = () => {}

type Forced = { "data-force-hover"?: true; "data-force-focus"?: true }

function forcedButtons(state: Forced) {
  return { wholeCity: state, zoomIn: state, zoomOut: state }
}

/** The controls of a capital's page on desktop, with their actions left out */
function controls(props: Partial<Parameters<typeof MapControls>[0]> = {}) {
  return (
    <MapControls
      onZoomIn={noop}
      onZoomOut={noop}
      onWholeCity={noop}
      layout="desktop"
      {...props}
    />
  )
}

function ControlStates() {
  const { x, y } = motionDetails.squashHeldScale

  return (
    <Cell
      title="Controls · top right"
      note={
        <>
          &ldquo;Whole city&rdquo; (a capital&apos;s page only) above zoom in
          and zoom out, each with its name for screen readers. Hover: Surface 2
          and a 2 px rise; pressed: squash, a ring, then the spring back; focus:
          the 2 px Ink ring. A zoom button at its limit is disabled (half
          opacity) and keeps the focus. Home has no &ldquo;Whole city&rdquo;;
          the phone&apos;s band has no zoom buttons. Their actions are props
          until the map exists.
        </>
      }
    >
      <ThemePair>
        <OnMap>
          <div className="flex flex-wrap items-start gap-x-8 gap-y-5">
            {(
              [
                ["Rest", controls()],
                [
                  "Hover",
                  <span
                    key="hover"
                    className="inline-flex"
                    style={{
                      transform: `translateY(-${motionDetails.liftPanel}px)`,
                    }}
                  >
                    {controls({
                      buttonProps: forcedButtons({ "data-force-hover": true }),
                    })}
                  </span>,
                ],
                [
                  "Pressed",
                  <span
                    key="pressed"
                    className="inline-flex"
                    style={{ transform: `scale(${x}, ${y})` }}
                  >
                    {controls()}
                  </span>,
                ],
                [
                  "Focus",
                  controls({
                    buttonProps: forcedButtons({ "data-force-focus": true }),
                  }),
                ],
                ["Closest zoom", controls({ canZoomIn: false })],
                ["Farthest zoom", controls({ canZoomOut: false })],
                ["Home", controls({ onWholeCity: undefined })],
                ["Phone", controls({ layout: "phone" })],
              ] as Array<[string, ReactNode]>
            ).map(([name, sample]) => (
              <div key={name} className="flex flex-col items-end gap-2">
                <span className="text-small text-ink-2">{name}</span>
                {sample}
              </div>
            ))}
          </div>
        </OnMap>
      </ThemePair>
    </Cell>
  )
}

// Metres per pixel from the closest street to a wide view
const scales = [0.05, 0.3, 0.71, 1.2, 4, 12, 60]

function ScaleStates() {
  return (
    <Cell
      title="Scale · bottom right, at street level"
      note={
        <>
          The longest round distance (1, 2 or 5 × 10ⁿ m) whose bar fits in 168
          px, so the bar is 67 to 168 px wide; kilometres from 1 km. Numbers and
          units in the visitor&apos;s language (German below). On a translucent
          Surface. It follows the camera, with no motion of its own, and is
          hidden from screen readers.
        </>
      }
    >
      <ThemePair>
        <OnMap>
          <div className="flex flex-col gap-4">
            {(["en", "de"] as const).map((locale) => (
              <IntlProvider
                key={locale}
                locale={locale}
                messages={messages}
                timeZone={timeZone}
              >
                <div lang={locale} className="flex flex-wrap items-end gap-3">
                  {scales.map((value) => (
                    <div key={value} className="flex flex-col items-end gap-1">
                      <ScaleBar metresPerPixel={value} />
                      <span className="text-[11px] leading-none text-ink-2">
                        {value} m/px
                      </span>
                    </div>
                  ))}
                </div>
              </IntlProvider>
            ))}
          </div>
        </OnMap>
      </ThemePair>
    </Cell>
  )
}

// The widths of the map: the phone's band is the window's width, from 320
// px (the narrowest window the site reflows to) to 1023 px; on desktop the
// map is what the 480 px panel leaves, from 544 px (a 1024 px window)
const mapWidths: Array<[number, "phone" | "desktop"]> = [
  [320, "phone"],
  [360, "phone"],
  [390, "phone"],
  [430, "phone"],
  [640, "phone"],
  [1023, "phone"],
  [544, "desktop"],
  [640, "desktop"],
  [800, "desktop"],
  [960, "desktop"],
  [1200, "desktop"],
]

// The widest scale bar: 1 km filling its 168 px
const widestScale = 1000 / 168

function BottomAtWidth({
  width,
  layout,
  map,
  hint,
}: {
  width: number
  layout: "phone" | "desktop"
  map: "home" | "capital"
  hint: GuideState
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-small text-ink-2">
        {width} px · {layout === "phone" ? "phone band" : "desktop"} ·{" "}
        {map === "home" ? "Home" : "a capital"}
      </span>
      <div
        data-map-bottom-sample={`${layout}-${width}-${map}`}
        className="relative h-56 max-w-full rounded-control bg-land"
        style={{ width }}
      >
        <MapBottom
          layout={layout}
          attribution={<MapAttribution map={map} sources={sources} />}
          scale={map === "capital" && <ScaleBar metresPerPixel={widestScale} />}
          keyHint={<KeyHint state={hint} visible />}
        />
      </div>
    </div>
  )
}

function BottomStates() {
  return (
    <Cell
      title="Bottom of the map · attribution, scale and key hint"
      note={
        <>
          The attribution bottom left and the scale bottom right share one row,
          14 px from the bottom; the key hint sits centred above that row, so it
          never covers them. The attribution names the sources the map is drawn
          from, each linked to its page, with short names on the map (About has
          the full credits): Home, &ldquo;© OpenStreetMap · Natural
          Earth&rdquo;; a capital, &ldquo;© OpenStreetMap · Overture · Meta
          &amp; WRI&rdquo;. OpenStreetMap first, as the ODbL asks, linked to its
          copyright page. It stays on one line from the narrowest phone band
          (320 px) up. On the phone&apos;s band the row sits 52 px up, above the
          band&apos;s fade, and has no scale. Shown at each width of the map,
          with the widest scale bar and the longest key hints.
        </>
      }
    >
      {(["light", "dark"] as const).map((theme) => (
        <ThemeScope
          key={theme}
          theme={theme}
          className="flex flex-col gap-4 rounded-control border border-line p-5"
        >
          <p className="text-label text-ink-2 uppercase">
            {theme === "light" ? "Light" : "Dark"}
          </p>
          {mapWidths.map(([width, layout]) => (
            <Fragment key={`${layout}-${width}`}>
              <BottomAtWidth
                width={width}
                layout={layout}
                map="capital"
                hint="street"
              />
              <BottomAtWidth
                width={width}
                layout={layout}
                map="home"
                hint="home"
              />
            </Fragment>
          ))}
        </ThemeScope>
      ))}
    </Cell>
  )
}

/**
 * A tile of the Home map with one capital and its label, the capital at
 * (`x`, `y`) as fractions of the tile
 */
function LabelSample({
  capital,
  x = 0.5,
  y = 0.8,
  name,
}: {
  capital: typeof stockholm
  x?: number
  y?: number
  name?: string
}) {
  const [ref, size] = useSize<HTMLDivElement>()
  const at = { x: size.width * x, y: size.height * y }

  return (
    <div className="flex flex-col gap-1.5">
      {name && <span className="text-small text-ink-2">{name}</span>}
      <div
        ref={ref}
        data-label-tile=""
        className="relative h-44 overflow-hidden rounded-control bg-europe-sea"
      >
        <StandInCapital x={at.x} y={at.y} />
        <HoverLabel
          capital={capital}
          x={at.x}
          y={at.y - CAPITAL_RADIUS}
          map={size}
        />
      </div>
    </div>
  )
}

// Capitals near each edge: the label flips below near the top and slides
// sideways near the left and right edges
const edges: Array<[string, number, number]> = [
  ["Top left", 0.04, 0.06],
  ["Top", 0.5, 0.1],
  ["Top right", 0.96, 0.06],
  ["Left", 0.03, 0.75],
  ["Right", 0.97, 0.75],
  ["Bottom", 0.5, 0.97],
]

function HoverLabelStates() {
  return (
    <Cell
      title="Home label · the capital under the pointer"
      note={
        <>
          Its name, its country and the share of its residents meeting all three
          rules (a whole percent), 12 px above the capital, with the soft lift.
          Near the top of the map it goes 12 px below the capital instead, and
          near the left and right edges it slides sideways, so it always stays 8
          px inside the map. It rises 3 px into place with its capital (Lift)
          and fades out; under reduced motion it only fades. Also shown for the
          capital in keyboard focus. The map will announce the capital, so the
          label is hidden from screen readers.
        </>
      }
    >
      <ThemePair>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
          <LabelSample capital={stockholm} name="Stockholm" />
          <LabelSample
            capital={labelOf(first.slug)}
            name="First in the ranking"
          />
          <LabelSample
            capital={labelOf(last.slug)}
            name="Last in the ranking"
          />
          {edges.map(([name, x, y]) => (
            <LabelSample
              key={name}
              capital={stockholm}
              x={x}
              y={y}
              name={name}
            />
          ))}
        </div>
      </ThemePair>
    </Cell>
  )
}

function PulseSample({
  state,
  pointer,
}: {
  state: GuideState
  pointer: "click" | "tap"
}) {
  return (
    <OnMap className="relative h-20 w-full max-w-60">
      <StandInPulse x={40} y={40} />
      <PulseTag state={state} x={40} y={40} pointer={pointer} />
    </OnMap>
  )
}

function PulseTagStates() {
  return (
    <Cell
      title="Pulse's tag · the Next step guide on the map"
      note={
        <>
          It follows the guide&apos;s state: &ldquo;Click to zoom in&rdquo; on
          the city overview, &ldquo;Click a building&rdquo; on the street,
          &ldquo;Tap…&rdquo; on touch devices; Home and a selected building have
          no pulse, so no tag. 22 px from the dot&apos;s centre, in an Ink pill
          with the soft lift. It floats in 0.3 s after the dot (Float); under
          reduced motion it fades in, beside a still dot with one faint ring.
          The dot and its rings here are stand-ins: the map draws them. The
          guide says the same, so screen readers skip the tag.
        </>
      }
    >
      <ThemePair>
        <States
          rows={[
            [
              "City overview",
              <div key="overview" className="grid gap-3 desktop:grid-cols-2">
                <PulseSample state="overview" pointer="click" />
                <PulseSample state="overview" pointer="tap" />
              </div>,
            ],
            [
              "Street",
              <div key="street" className="grid gap-3 desktop:grid-cols-2">
                <PulseSample state="street" pointer="click" />
                <PulseSample state="street" pointer="tap" />
              </div>,
            ],
          ]}
        />
      </ThemePair>
    </Cell>
  )
}

const hintNames: Record<GuideState, string> = {
  home: "Home",
  overview: "City overview",
  street: "Street",
  building: "Building, rule 3",
  facade: "Facade",
  explore: "Rule 30 or 300",
}

function KeyHintStates() {
  return (
    <Cell
      title="Key hint · while the map has the keyboard's focus"
      note={
        <>
          One line at the bottom of the map, above the attribution and the
          scale, saying which keys do what in the current view (the keys of the
          keyboard draft). An Ink pill, each key in a cap. It floats in when the
          map gets focus (Float) and fades out when it leaves; under reduced
          motion it only fades. It stays in the page while hidden, as the
          map&apos;s description for screen readers. It wraps on a narrow band.
        </>
      }
    >
      <ThemePair>
        <States
          rows={guideStates.map((state) => [
            hintNames[state],
            <OnMap key={state} className="flex justify-center">
              <KeyHint state={state} visible />
            </OnMap>,
          ])}
        />
      </ThemePair>
    </Cell>
  )
}

function TwoFingerStates() {
  return (
    <Cell
      title="“Use two fingers” · the phone's map band"
      note={
        <>
          On the phone&apos;s band one finger scrolls the page; a one-finger
          sideways drag shows this hint for 2 s, centred on the band. It floats
          in (Float) and fades out; under reduced motion it only fades. Screen
          readers hear it politely.
        </>
      }
    >
      <ThemePair>
        <OnMap className="grid h-32 place-items-center">
          <TwoFingerHint visible />
        </OnMap>
      </ThemePair>
    </Cell>
  )
}

export function MapOverlaysKit() {
  return (
    <IntlProvider locale="en" messages={messages} timeZone={timeZone}>
      <section
        id="map-overlays"
        aria-labelledby="map-overlays-title"
        className="flex flex-col gap-7 rounded-panel border border-line bg-surface px-8 py-7"
      >
        <div className="flex flex-col gap-2">
          <h2 id="map-overlays-title" className="font-serif text-title">
            Map overlays
          </h2>
          <p className="max-w-190 text-small text-ink-2">
            The legend, the controls, the scale, the attribution, the Home
            label, the pulse&apos;s tag, the key hint and the phone&apos;s
            &ldquo;Use two fingers&rdquo; hint, 16 px from the map&apos;s edges.
            Only what floats on the map has the soft lift. They come to the site
            with the map (step 14).
          </p>
        </div>

        <ReducedMotionSwitch />
        <TryIt />
        <LegendStates />
        <ControlStates />
        <ScaleStates />
        <BottomStates />
        <HoverLabelStates />
        <PulseTagStates />
        <KeyHintStates />
        <TwoFingerStates />
      </section>
    </IntlProvider>
  )
}
