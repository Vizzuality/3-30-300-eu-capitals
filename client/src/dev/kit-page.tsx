/*
 * The kit page (`/dev/kit`, development only): every element built so far, in
 * both themes, laid out like the reference design's UI kit. It is a tool for
 * the team, never shipped, so its text is not translated.
 */
import type { ReactNode } from "react"

import {
  colors,
  radii,
  spacing,
  typeScale,
  type ThemeColor,
  type TypeStyle,
} from "@/design/tokens"
import { cn } from "@/lib/utils"

type ColorName = keyof typeof colors

const colorGroups: Array<{
  name: string
  items: Array<[ColorName, string, string?]>
}> = [
  {
    name: "Interface",
    items: [
      ["background", "Background", "Page, map surroundings"],
      ["surface", "Surface", "Panel, cards, map overlays"],
      ["surface2", "Surface 2", "Inputs, tabs, hovered rows, cards"],
      ["ink", "Ink", "Text, selection, the guide"],
      ["ink2", "Ink 2", "Secondary text"],
      ["line", "Line", "Hairlines"],
    ],
  },
  {
    name: "Results · rules met",
    items: [
      ["result0", "Results 0 · none"],
      ["result1", "Results 1"],
      ["result2", "Results 2"],
      ["result3", "Results 3 · all"],
    ],
  },
  {
    name: "Muted results · other capitals",
    items: [
      ["resultMuted0", "Muted 0"],
      ["resultMuted1", "Muted 1"],
      ["resultMuted2", "Muted 2"],
      ["resultMuted3", "Muted 3"],
    ],
  },
  {
    name: "Greenery, water, facades",
    items: [
      ["tree", "Trees and canopy", "Never used for results"],
      ["park", "Parks"],
      ["water", "Water"],
      ["shallows", "Shallows", "Along shores"],
      ["passes", "Passes", "Facades that see 3 trees or more, sight lines"],
    ],
  },
  {
    name: "Map",
    items: [
      ["land", "Land"],
      ["street", "Street"],
      ["streetCasing", "Street casing"],
      ["building", "Building", "Outside the city, dimmed"],
      ["shadow", "Shadow", "Ink at 16%, black at 16% in dark mode"],
      ["treeRim", "Tree rim", "Crown rim, park stipple"],
      ["waterLines", "Water lines", "Contours, hatching"],
    ],
  },
  {
    name: "Europe (Home map)",
    items: [
      ["europeLand1", "Europe land 1"],
      ["europeLand2", "Europe land 2"],
      ["europeLand3", "Europe land 3"],
      ["europeOther", "Other countries"],
      ["europeSea", "Sea"],
    ],
  },
]

// Classes of each type style, written out so that Tailwind finds them
const typeClasses: Record<keyof typeof typeScale, string> = {
  display: "font-serif text-display",
  displayPhone: "font-serif text-display-phone",
  title: "font-serif text-title",
  heading: "font-serif text-heading",
  body: "font-sans text-body",
  guide: "font-sans text-guide",
  control: "font-sans text-control",
  small: "font-sans text-small text-ink-2",
  label: "font-sans text-label text-ink-2 uppercase",
}

const typeNames: Record<keyof typeof typeScale, string> = {
  display: "Display",
  displayPhone: "Display, phone",
  title: "Title",
  heading: "Heading",
  body: "Body",
  guide: "Guide",
  control: "Control",
  small: "Small",
  label: "Label",
}

const typeSamples: Array<[keyof typeof typeScale, string, string]> = [
  ["display", "How green is your capital?", "Home title"],
  ["displayPhone", "How green is your capital?", "Home title on phones"],
  ["title", "Stockholm", "Capital name, page titles"],
  [
    "heading",
    "28% of residents meet all three rules",
    "Card results, the ranking sentence, section titles",
  ],
  [
    "body",
    "Each building takes the colour of the number of rules its residents meet. Greenery has its own colour.",
    "Text",
  ],
  [
    "guide",
    "Click a building to see why it scores as it does",
    "The Next step guide",
  ],
  ["control", "Methodology", "Top bar links, tabs, rows, buttons"],
  [
    "small",
    "Sweden · about 1.04 million residents",
    "Notes, legends, ranking, footer",
  ],
  ["label", "Other capitals", "Section labels, guide step"],
]

const radiusSamples: Array<[string, string, string]> = [
  [`${radii.chip} px`, "rounded-chip", "Chips of the key, legend swatches"],
  [
    `${radii.control} px`,
    "rounded-control",
    "Buttons, cards, fields, tabs, the guide",
  ],
  [`${radii.panel} px`, "rounded-panel", "Panels, menus, figures"],
  ["Round", "rounded-full", "Icon buttons, map controls, map tags"],
]

const spacingRows: Array<[string, string, string]> = [
  ["Panel width", `${spacing.panel} px, on the left`, "Full width"],
  [
    "Panel side padding",
    `${spacing.panelInset} px`,
    `${spacing.panelInsetPhone} px`,
  ],
  ["Top bar height", `${spacing.topBar} px`, `${spacing.topBarPhone} px`],
  ["Between blocks of the panel", `${spacing.block} px`, `${spacing.block} px`],
  [
    "Map overlays from the edge",
    `${spacing.mapInset} px`,
    `${spacing.mapInset} px`,
  ],
  [
    "Touch targets",
    `at least ${spacing.target} px (${spacing.targetPhone} on the map)`,
    `at least ${spacing.targetPhone} px`,
  ],
]

/** Light or dark text, whichever reads on the colour (as in the UI kit) */
function textOn(hex: string) {
  const n = Number.parseInt(hex.slice(1, 7), 16)
  const luminance =
    0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return luminance > 150 ? colors.ink.light : colors.surface.light
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4.5 rounded-panel border border-line bg-surface px-8 py-7">
      <h2 className="font-serif text-title">{title}</h2>
      {children}
    </section>
  )
}

function Swatch({
  color,
  name,
  use,
}: {
  color: ThemeColor
  name: string
  use?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-13 overflow-hidden rounded-control border border-line">
        {(["light", "dark"] as const).map((theme) => (
          <span
            key={theme}
            className="flex flex-1 items-end px-2 py-1.5 text-[11px] leading-none font-medium"
            style={{ background: color[theme], color: textOn(color[theme]) }}
          >
            {color[theme]}
          </span>
        ))}
      </div>
      <div>
        <p className="text-small font-semibold">{name}</p>
        {use && <p className="text-[12px] leading-4 text-ink-2">{use}</p>}
      </div>
    </div>
  )
}

function typeMeta({ font, size, lineHeight, weight }: TypeStyle) {
  return `${font === "serif" ? "Fraunces" : "Figtree"} ${weight} · ${size} / ${lineHeight}`
}

export function KitPage() {
  return (
    <main className="mx-auto flex max-w-360 flex-col gap-7 px-12 pt-16 pb-20">
      <header className="flex flex-col gap-3">
        <p className="text-label text-ink-2 uppercase">UI kit · 1 of 5</p>
        <h1 className="font-serif text-[56px] leading-[60px] font-medium tracking-[-0.02em]">
          Foundations
        </h1>
        <p className="max-w-190 text-[18px] leading-7 text-ink-2">
          The design tokens of src/design/tokens.ts: colours with their light
          and dark values, type, shape and spacing. The page itself follows the
          system&apos;s colour scheme.
        </p>
      </header>

      <Panel title="Colour">
        <p className="text-small text-ink-2">
          Every token has a light and a dark value (left and right half of each
          swatch).
        </p>
        {colorGroups.map((group) => (
          <div key={group.name} className="mt-1.5 flex flex-col gap-2.5">
            <h3 className="text-control font-semibold">{group.name}</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
              {group.items.map(([key, name, use]) => (
                <Swatch key={key} color={colors[key]} name={name} use={use} />
              ))}
            </div>
          </div>
        ))}
      </Panel>

      <Panel title="Type">
        <p className="text-small text-ink-2">
          Fraunces in its soft cut (SOFT 100, WONK 0) for titles, Figtree for
          reading and the interface. Pages in Greek and Bulgarian use Noto Serif
          and Noto Sans in the same sizes and weights. Tabular figures
          everywhere.
        </p>
        <div>
          {typeSamples.map(([key, sample, use]) => (
            <TypeRow
              key={key}
              name={typeNames[key]}
              meta={typeMeta(typeScale[key])}
              use={use}
            >
              <p className={typeClasses[key]}>{sample}</p>
            </TypeRow>
          ))}
          <TypeRow
            name="Numbers"
            meta="Tabular figures"
            use="Rounded to a whole percent everywhere"
          >
            <div className="grid grid-cols-[160px_60px] gap-x-6 gap-y-0.5 text-control">
              <span>Helsinki</span>
              <b className="text-right">30%</b>
              <span>Stockholm</span>
              <b className="text-right">28%</b>
              <span>Berlin</span>
              <b className="text-right">27%</b>
            </div>
          </TypeRow>
          <TypeRow
            name="Greek"
            meta="Noto Serif 500 / Noto Sans"
            use="Pages in Greek (sample text, to be translated)"
          >
            <div lang="el" className="flex flex-col gap-1">
              <span className={typeClasses.title}>Αθήνα</span>
              <span className={typeClasses.body}>
                Πόσο πράσινη είναι η πρωτεύουσά σας;
              </span>
            </div>
          </TypeRow>
          <TypeRow
            name="Bulgarian"
            meta="Noto Serif 500 / Noto Sans"
            use="Pages in Bulgarian (sample text, to be translated)"
          >
            <div lang="bg" className="flex flex-col gap-1">
              <span className={typeClasses.title}>София</span>
              <span className={typeClasses.body}>
                Колко зелена е вашата столица?
              </span>
            </div>
          </TypeRow>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-5">
        <Panel title="Shape">
          <div className="flex flex-wrap items-start gap-5">
            {radiusSamples.map(([size, radius, use]) => (
              <div key={radius} className="flex w-42.5 flex-col gap-2">
                <div
                  className={cn({
                    "h-18 border border-line bg-surface-2": true,
                    [radius]: true,
                    "w-18": radius === "rounded-full",
                  })}
                />
                <span className="text-control font-semibold">{size}</span>
                <span className="text-small text-ink-2">{use}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-start gap-5">
            <div className="flex w-42.5 flex-col gap-2">
              <div className="h-18 rounded-control border border-line bg-surface" />
              <span className="text-control font-semibold">Flat</span>
              <span className="text-small text-ink-2">
                Panel, cards, lists, buttons: a hairline where needed, no shadow
              </span>
            </div>
            <div className="flex w-42.5 flex-col gap-2">
              <div className="h-18 rounded-control bg-surface shadow-lift" />
              <span className="text-control font-semibold">Soft lift</span>
              <span className="text-small text-ink-2">
                Only what floats on the map: controls, legend, labels, the
                language list
              </span>
            </div>
          </div>
        </Panel>
        <Panel title="Spacing and sizes">
          <table className="w-full border-collapse text-control">
            <thead>
              <tr className="border-b border-line text-left text-label text-ink-2 uppercase">
                <th className="py-2 pr-3 font-semibold">What</th>
                <th className="py-2 pr-3 font-semibold">Desktop</th>
                <th className="py-2 pr-3 font-semibold">Phone</th>
              </tr>
            </thead>
            <tbody>
              {spacingRows.map(([what, desktop, phone]) => (
                <tr key={what} className="border-b border-line align-top">
                  <td className="py-2.5 pr-3">{what}</td>
                  <td className="py-2.5 pr-3">{desktop}</td>
                  <td className="py-2.5 pr-3">{phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </main>
  )
}

function TypeRow({
  name,
  meta,
  use,
  children,
}: {
  name: string
  meta: string
  use: string
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-[160px_minmax(0,1fr)_260px] items-baseline gap-6 border-t border-line py-4 first:border-t-0">
      <div>
        <p className="text-control font-semibold">{name}</p>
        <p className="text-small text-ink-2">{meta}</p>
      </div>
      {children}
      <p className="text-small text-ink-2">{use}</p>
    </div>
  )
}
