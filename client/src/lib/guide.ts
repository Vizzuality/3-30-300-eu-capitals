import { defaultRule, type Rule } from "@/lib/rules"

/*
 * The Next step guide tells the visitor what to do next, along the path
 * City → Street → Building. Which step it shows follows the page and what
 * the map shows: Home, the city overview, the street, a selected building
 * (rule 3), one of its facades, or rules 30 and 300.
 */

export const guideStates = [
  "home",
  "overview",
  "street",
  "building",
  "facade",
  "explore",
] as const

export type GuideState = (typeof guideStates)[number]

/** How far the capital's map is zoomed when no building is selected */
export type MapView = "overview" | "street"

export type GuideInput =
  | { page: "home" }
  | {
      page: "capital"
      /**
       * The map's view when no building is selected, from the area in view
       * (see `mapViewOf`): the city overview when it is not given
       */
      view?: MapView
      building?: number
      rule?: Rule
      facade?: number
    }

/** The guide's state for what the visitor sees */
export function guideState(input: GuideInput): GuideState {
  if (input.page === "home") {
    return "home"
  }
  // A selected building implies street level, whatever the view says
  if (input.building === undefined) {
    return input.view === "street" ? "street" : "overview"
  }
  // Rules 30 and 300 are the same for the whole building: a facade only
  // counts with rule 3
  if ((input.rule ?? defaultRule) !== 3) {
    return "explore"
  }
  return input.facade === undefined ? "building" : "facade"
}

/** The number of steps along the path City → Street → Building */
export const pathLength = 3

/**
 * The step of the path the visitor is on: 0 before it starts (Home), then
 * 1 on the city overview, 2 on the street and 3 once a building is selected
 * (also with a facade, or another rule)
 */
export function pathStep(state: GuideState) {
  switch (state) {
    case "home":
      return 0
    case "overview":
      return 1
    case "street":
      return 2
    default:
      return pathLength
  }
}

/** The guide's step label: "Start here", "Next · 2 of 3", "Explore"… */
export type GuideLabel =
  | { kind: "start" }
  | { kind: "next"; step: number; total: number }
  | { kind: "facade" }
  | { kind: "explore" }

export function guideLabel(state: GuideState): GuideLabel {
  switch (state) {
    case "home":
      return { kind: "start" }
    case "facade":
      return { kind: "facade" }
    case "explore":
      return { kind: "explore" }
    default:
      return { kind: "next", step: pathStep(state), total: pathLength }
  }
}

/** One dot of the path: a step done, the current one, or one still ahead */
export type PathDot = "done" | "current" | "ahead"

/** The path's three dots; none before the path starts (Home) */
export function pathDots(state: GuideState): Array<PathDot> {
  const step = pathStep(state)
  if (step === 0) {
    return []
  }
  return Array.from({ length: pathLength }, (_, index) => {
    const dot = index + 1
    if (dot < step) {
      return "done"
    }
    return dot === step ? "current" : "ahead"
  })
}

/** How the visitor points: with a mouse ("Click") or a finger ("Tap") */
export type PointerKind = "click" | "tap"

/** The keys of the guide's messages, within its namespace */
export type GuideMessageKey =
  | "label.start"
  | "label.facade"
  | "label.explore"
  | `sentence.${GuideState}.${PointerKind}`

/**
 * The guide's text in the visitor's language: its step label and its
 * sentence, for a mouse and for a finger. Each is one whole message.
 */
export function guideText(
  state: GuideState,
  t: (
    key: GuideMessageKey | "label.next",
    values?: { step: number; total: number }
  ) => string
) {
  const label = guideLabel(state)
  return {
    label:
      label.kind === "next"
        ? t("label.next", { step: label.step, total: label.total })
        : t(`label.${label.kind}`),
    sentence: {
      click: t(`sentence.${state}.click`),
      tap: t(`sentence.${state}.tap`),
    },
  }
}
