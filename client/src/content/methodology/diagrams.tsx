import { useTranslations } from "use-intl"

import { canopyRadius, parkArea, ruleThresholds } from "@/lib/rules"
import { Diagram } from "./blocks"

/*
 * The diagram of each rule, drawn in the map's style: warm paper land, light streets with a thin casing,
 * round tree crowns with a darker rim, the selected building in Surface with
 * an Ink outline and its passing facade as a thick line on the wall, the
 * 500 m circle and the walk in Ink with a Surface halo, and the park in full
 * green, as evidence. Their labels are the page's messages.
 */

const crown = "fill-tree stroke-tree-rim"

/** 3 trees: a facade that sees three trees, and a tree a building hides */
export function TreesDiagram() {
  const t = useTranslations("methodology.trees.diagram")

  return (
    <Diagram
      width={600}
      height={270}
      alt={t("alt")}
      caption={t("caption")}
      labels={[
        {
          text: t("home"),
          x: 284,
          y: 148,
          align: "middle",
          className: "text-tag text-ink",
        },
        {
          text: t("seen", { count: ruleThresholds.trees }),
          x: 416,
          y: 50,
          align: "start",
        },
        { text: t("hidden"), x: 588, y: 188, align: "end", maxWidth: 0.3 },
      ]}
    >
      <rect width="600" height="270" className="fill-land" />
      <path d="M0 238 H600" strokeWidth="26" className="stroke-street-casing" />
      <path d="M0 238 H600" strokeWidth="22" className="stroke-street" />
      <path d="M84 0 V270" strokeWidth="22" className="stroke-street-casing" />
      <path d="M84 0 V270" strokeWidth="18" className="stroke-street" />
      {/* The view to the hidden tree, cut by the building in its way */}
      <path
        d="M372 148 H537"
        strokeWidth="1"
        strokeDasharray="3 4"
        opacity="0.55"
        className="stroke-ink-2"
      />
      <rect x="430" y="112" width="60" height="66" className="fill-building" />
      {/* The lines to the trees the north facade sees */}
      <g
        fill="none"
        strokeWidth="1.6"
        strokeDasharray="1 4"
        strokeLinecap="round"
        className="stroke-passes"
      >
        <path d="M230 110 L172 40" />
        <path d="M280 110 L300 34" />
        <path d="M332 110 L398 52" />
      </g>
      <rect
        x="196"
        y="110"
        width="176"
        height="76"
        strokeWidth="2"
        className="fill-surface stroke-ink"
      />
      <path
        d="M196 110 H372"
        strokeWidth="9"
        strokeLinecap="round"
        className="stroke-surface"
      />
      <path
        d="M196 110 H372"
        strokeWidth="5"
        strokeLinecap="round"
        className="stroke-passes"
      />
      <g strokeWidth="1.3" className={crown}>
        <circle cx="172" cy="40" r="9" />
        <circle cx="300" cy="34" r="9" />
        <circle cx="398" cy="52" r="9" />
      </g>
      <circle
        cx="546"
        cy="148"
        r="9"
        strokeWidth="1.3"
        opacity="0.45"
        className={crown}
      />
    </Diagram>
  )
}

/** 30% canopy: the 500 m circle around a home, with the river left out */
export function CanopyDiagram() {
  const t = useTranslations("methodology.canopy.diagram")

  return (
    <Diagram
      width={600}
      height={240}
      alt={t("alt")}
      caption={t("caption")}
      labels={[
        {
          text: t("radius", { radius: canopyRadius }),
          x: 228,
          y: 106,
          align: "middle",
        },
        {
          text: t("water"),
          x: 588,
          y: 36,
          align: "end",
          maxWidth: 0.3,
          className: "text-ink",
        },
        { text: t("canopy"), x: 40, y: 222, align: "start" },
      ]}
    >
      <rect width="600" height="240" className="fill-land" />
      <path
        d="M350 0 C330 80 370 160 340 240 L600 240 L600 0 Z"
        className="fill-water"
      />
      <g opacity="0.55" className="fill-tree">
        <path d="M210 40 q30 -14 52 6 q18 20 -6 34 q-30 12 -48 -8 q-14 -18 2 -32z" />
        <path d="M150 120 q24 -16 44 0 q12 22 -10 32 q-26 8 -38 -10 q-6 -14 4 -22z" />
        <path d="M270 150 q34 -10 50 12 q8 24 -20 30 q-32 4 -40 -18 q-2 -16 10 -24z" />
        <path d="M290 50 q18 -10 30 4 q8 16 -8 22 q-20 6 -26 -8 q-4 -12 4 -18z" />
        <path d="M60 170 q24 -14 44 2 q10 20 -12 28 q-26 6 -34 -10 q-4 -12 2 -20z" />
      </g>
      <circle
        cx="280"
        cy="120"
        r="104"
        fill="none"
        strokeWidth="6"
        className="stroke-surface"
      />
      <circle
        cx="280"
        cy="120"
        r="104"
        fill="none"
        strokeWidth="2"
        className="stroke-ink"
      />
      <rect x="268" y="110" width="24" height="18" className="fill-result-2" />
      <path
        d="M268 120 H176"
        strokeWidth="1"
        strokeDasharray="3 3"
        className="stroke-ink-2"
      />
    </Diagram>
  )
}

// The walk drawn, in metres
const drawnWalk = 94

/** 300 m to a park: the walk along the streets from a home to a park */
export function ParkDiagram() {
  const t = useTranslations("methodology.park.diagram")
  const route = "M155 168 V150 H300 V112 H360"

  return (
    <Diagram
      width={600}
      height={220}
      alt={t("alt")}
      caption={t("caption")}
      labels={[
        {
          text: t("park", { area: parkArea }),
          x: 450,
          y: 70,
          align: "middle",
          maxWidth: 0.5,
          park: true,
        },
        {
          text: t("walk", { distance: drawnWalk }),
          x: 196,
          y: 128,
          align: "start",
        },
        {
          text: t("home"),
          x: 112,
          y: 190,
          align: "end",
          className: "text-tag text-ink",
        },
      ]}
    >
      <rect width="600" height="220" className="fill-land" />
      <path
        d="M0 150 H600 M300 0 V220"
        strokeWidth="24"
        className="stroke-street-casing"
      />
      <path
        d="M0 150 H600 M300 0 V220"
        strokeWidth="20"
        className="stroke-street"
      />
      <rect
        x="360"
        y="20"
        width="200"
        height="100"
        rx="4"
        className="fill-tree"
      />
      <rect x="120" y="170" width="70" height="40" className="fill-result-2" />
      <path
        d={route}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-surface"
      />
      <path
        d={route}
        fill="none"
        strokeWidth="3"
        strokeDasharray="0.1 7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-ink"
      />
    </Diagram>
  )
}
