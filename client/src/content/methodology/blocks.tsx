import type { ReactNode } from "react"
import { useTranslations } from "use-intl"

import { cn } from "@/lib/utils"
import { methodologySections, type MethodologySection } from "./sections"

/*
 * The pieces every section of the Methodology page is made of: its label
 * and title, the idea in plain words with its steps, a diagram, and the
 * "In detail" box with the scientific information.
 */

/** The emphasis of a paragraph (`<b>Find the trees.</b> …`) */
export const richTags = {
  b: (chunks: ReactNode) => <b className="font-semibold">{chunks}</b>,
}

const ruleCount = 3

/**
 * A section, with its label ("The three rules · 1 of 3", or its number) and
 * its title. The table of contents moves focus to it, so the next Tab
 * continues from there; it is not a control, so it shows no focus ring.
 * Scrolled to, it starts at the top of the reading page with its own top
 * spacing only: from its rule for the sections after the first, and from
 * the reading page's own top spacing for the first.
 */
export function Section({
  section,
  first,
  children,
}: {
  section: MethodologySection
  first: boolean
  children: ReactNode
}) {
  const t = useTranslations("methodology")
  const n = methodologySections.indexOf(section) + 1
  const isRule = n <= ruleCount

  return (
    <section
      id={section.id}
      tabIndex={-1}
      className={cn({
        "flex flex-col gap-5 outline-none focus-visible:outline-none": true,
        "scroll-mt-10 desktop:scroll-mt-14": first,
        "mt-7 border-t border-line pt-9": !first,
        // The last section is at least as tall as the window, so that on a
        // tall screen it can still reach the top
        "min-h-dvh": n === methodologySections.length,
      })}
    >
      <p className="text-label text-ink-2 uppercase">
        {t("sectionLabel", {
          group: isRule ? "rules" : "other",
          n,
          count: ruleCount,
        })}
      </p>
      <h2 className="font-serif text-display-phone desktop:text-display">
        {t(`sections.${section.key}`)}
      </h2>
      {children}
    </section>
  )
}

/** A few simple steps, numbered: each of `items`, as `render` writes it */
export function Steps<Item extends string>({
  items,
  render,
}: {
  items: ReadonlyArray<Item>
  render: (item: Item) => ReactNode
}) {
  return (
    <ol className="flex flex-col gap-3.5">
      {items.map((item, index) => (
        <li
          key={item}
          className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 text-body"
        >
          <span
            aria-hidden="true"
            className="grid size-6.5 place-items-center rounded-full border border-line bg-surface text-label text-ink-2"
          >
            {index + 1}
          </span>
          <span>{render(item)}</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * A box of facts, as a list under a small heading ("In detail"): each of
 * `items`, as `render` writes it
 */
export function Detail<Item extends string>({
  title,
  items,
  render,
}: {
  title: string
  items: ReadonlyArray<Item>
  render: (item: Item) => ReactNode
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-control border border-line bg-surface px-5 pt-4 pb-4.5">
      <h3 className="text-label text-ink-2 uppercase">{title}</h3>
      <ul className="flex list-disc flex-col gap-2 pl-4.5 text-card-status">
        {items.map((item) => (
          <li key={item}>{render(item)}</li>
        ))}
      </ul>
    </div>
  )
}

/** A label of a diagram, placed over its drawing */
export type DiagramLabel = {
  text: string
  // Where the label is anchored, in the drawing's units
  x: number
  y: number
  // Which side of the label the point is on, across; the label's middle
  // is on it, down
  align: "start" | "middle" | "end"
  // The label's widest, as a share of the drawing, before it wraps
  maxWidth?: number
  // A park's name, as the map writes it: a Surface pill with a green dot
  park?: boolean
  className?: string
}

/**
 * A diagram in the map's style: a drawing (`children`, in the units of
 * `width` × `height`) with its labels over it, then its caption. The labels
 * are text over the drawing rather than in it, so they stay legible when
 * the drawing shrinks on a phone; the whole is one image, named by `alt`.
 */
export function Diagram({
  width,
  height,
  alt,
  labels,
  caption,
  children,
}: {
  width: number
  height: number
  alt: string
  labels: Array<DiagramLabel>
  caption: string
  children: ReactNode
}) {
  return (
    <figure className="my-1.5 flex flex-col gap-2.5 rounded-panel border border-line bg-surface p-4">
      <div
        // The drawing and its labels, read as one image: an `<img>` cannot
        // hold them
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="img"
        aria-label={alt}
        className="relative overflow-hidden rounded-control"
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          className="block h-auto w-full"
        >
          {children}
        </svg>
        {labels.map((label) => (
          <span
            key={label.text}
            className={cn({
              "absolute w-max -translate-y-1/2 text-street-name text-ink-2": true,
              "text-left": label.align === "start",
              "-translate-x-1/2 text-center": label.align === "middle",
              "-translate-x-full text-right": label.align === "end",
              "flex items-center gap-2 rounded-full bg-surface py-0.5 pr-3 pl-2 text-tag text-ink":
                label.park === true,
              [label.className ?? ""]: Boolean(label.className),
            })}
            style={{
              left: `${(label.x / width) * 100}%`,
              top: `${(label.y / height) * 100}%`,
              maxWidth:
                label.maxWidth === undefined
                  ? undefined
                  : `${label.maxWidth * 100}%`,
            }}
          >
            {label.park && (
              <span className="size-2.5 flex-none rounded-full bg-tree" />
            )}
            {label.text}
          </span>
        ))}
      </div>
      <figcaption className="text-small text-ink-2">{caption}</figcaption>
    </figure>
  )
}
