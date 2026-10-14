import type {
  EvidenceBuilding,
  EvidencePark,
  FacadeAttributes,
  Orientation,
} from "@/data/schemas"
import { ruleThresholds, type Rule } from "@/lib/rules"

/*
 * A selected building as the panel describes it: its residents, whether it
 * meets each rule, and the figures of each rule's card, in plain numbers.
 * They come from the building's evidence (its tile in `evidence.pmtiles`),
 * the green space its walk reaches, and its facades' attributes (from
 * `city.pmtiles`), which the map reads.
 *
 * A building's figures are rounded towards its results, as the data is, so
 * a card never contradicts its verdict: the share of residents seeing 3
 * trees is rounded up (a building meets the rule above half, and 50.1% must
 * not read 50%), its canopy down (29.9% must not read 30%). Its walk is
 * already in whole metres, rounded up.
 */

/** What the map knows of a building: its evidence, its park and facades */
export type BuildingRecord = {
  id: number
  building: EvidenceBuilding
  // The green space its walk reaches, or null when it reaches none
  park: EvidencePark | null
  // In any order
  facades: Array<FacadeAttributes>
}

/** How many residents live somewhere, as the panel says it */
export type ResidentsAmount = {
  /** None at all, fewer than one (the model spreads them), or about some */
  amount: "none" | "few" | "about"
  /** Rounded to a whole number */
  residents: number
}

/** One facade of a building, as its card describes it */
export type FacadeResult = {
  id: number
  orientation: Orientation
  residents: ResidentsAmount
  // How many different trees it sees
  trees: number
  // Whether it sees 3 trees or more
  met: boolean
}

/** How the walk to a park reads: along a route, from its edge, or none */
export type WalkKind = "route" | "touching" | "none"

export type SelectedBuilding = {
  id: number
  residents: ResidentsAmount
  met: Record<Rule, boolean>
  // Rule 3: the share of its residents behind facades that see 3 trees or
  // more (a whole percent, rounded up), and how many of its facades do
  trees: { percent: number; facades: number; passing: number }
  // Rule 30: the tree canopy within 500 m (a whole percent, rounded down)
  canopy: { percent: number }
  // Rule 300: the walk to the nearest park or forest, in metres, and its
  // name (null when it has none)
  walk: { kind: WalkKind; metres: number; park: string | null }
  facades: Array<FacadeResult>
}

/**
 * A share (from 0 to 1, written with three decimals) as a whole percent,
 * rounded up. Shares are first taken as a whole number of thousandths, so
 * 0.29 is 29%, whatever its binary value (0.28999…).
 */
export function percentUp(share: number) {
  return Math.ceil(Math.round(share * 1000) / 10)
}

/** A share, written with three decimals, as a whole percent, rounded down */
export function percentDown(share: number) {
  return Math.floor(Math.round(share * 1000) / 10)
}

/** A modelled number of residents, as the panel says it */
export function residentsAmount(residents: number): ResidentsAmount {
  const rounded = Math.round(residents)
  if (residents === 0) {
    return { amount: "none", residents: 0 }
  }
  return { amount: rounded === 0 ? "few" : "about", residents: rounded }
}

/** The facades of a building, in order, with what each one sees */
function facadeResults({ building, facades }: BuildingRecord) {
  const { first, seen } = building.facades
  if (first === null) {
    return []
  }
  const attributes = new Map(facades.map((facade) => [facade.sid, facade]))
  return seen.flatMap((trees, index): Array<FacadeResult> => {
    const facade = attributes.get(first + index)
    if (!facade) {
      return []
    }
    return [
      {
        id: facade.sid,
        orientation: facade.orient,
        residents: residentsAmount(facade.res),
        trees: trees.length,
        met: trees.length >= ruleThresholds.trees,
      },
    ]
  })
}

/** The panel's description of a building, from what the map knows of it */
export function selectedBuilding(record: BuildingRecord): SelectedBuilding {
  const { building, park } = record
  const [trees, canopy, walk] = building.rules.map((flag) => flag === 1)
  const facades = facadeResults(record)

  return {
    id: record.id,
    residents: residentsAmount(building.residents),
    met: { 3: trees, 30: canopy, 300: walk },
    trees: {
      percent: percentUp(building.share3),
      facades: building.facades.seen.length,
      passing: building.facades.seen.filter(
        (seen) => seen.length >= ruleThresholds.trees
      ).length,
    },
    canopy: { percent: percentDown(building.canopy) },
    walk: {
      kind:
        building.walk === null
          ? "none"
          : building.walk === 0
            ? "touching"
            : "route",
      metres: building.walk ?? 0,
      park: park?.name ?? null,
    },
    facades,
  }
}
