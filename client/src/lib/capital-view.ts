import {
  selectedBuilding,
  type BuildingRecord,
  type FacadeResult,
  type SelectedBuilding,
} from "@/lib/building"
import type { CapitalSearch } from "@/lib/capital-search"
import type { GuideInput } from "@/lib/guide"
import type { Rule } from "@/lib/rules"
import { mapViewOf, parseVisibleArea } from "@/lib/visible-area"

/*
 * What a capital's page shows: the city overview, the street, or a selected
 * building with one of its rules (and, with the 3 trees rule, perhaps one of
 * its facades). The panel's middle block and the Next step guide follow it.
 *
 * A building is selected when the address names one the map knows. Without
 * one, the view follows the area of the map in view: the city overview, or
 * the street once zoomed in.
 */
export type CapitalView =
  | { view: "overview" }
  | { view: "street" }
  | {
      view: "building"
      building: SelectedBuilding
      rule: Rule
      // One of its facades, with the 3 trees rule only
      facade?: FacadeResult
    }

/**
 * The view for the page's address, with the record of the building it names
 * (undefined while the map does not know it). A building or a facade the
 * map does not know is left out.
 */
export function capitalView(
  search: CapitalSearch,
  record: BuildingRecord | undefined
): CapitalView {
  if (search.building !== undefined && record?.id === search.building) {
    const building = selectedBuilding(record)
    return {
      view: "building",
      building,
      rule: search.rule,
      facade: building.facades.find(({ id }) => id === search.facade),
    }
  }
  const area = search.at === undefined ? undefined : parseVisibleArea(search.at)
  return { view: mapViewOf(area) }
}

/** What the Next step guide needs to know of the view */
export function guideInput(view: CapitalView): GuideInput {
  return view.view === "building"
    ? {
        page: "capital",
        building: view.building.id,
        rule: view.rule,
        facade: view.facade?.id,
      }
    : { page: "capital", view: view.view }
}
