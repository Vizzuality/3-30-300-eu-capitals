/*
 * The figures of a selected building, until the map reads them from a
 * capital's tiles: a few real buildings of Stockholm, copied from a pipeline
 * release in the release's own shapes (each building's evidence and its
 * park, from `evidence.pmtiles`, and its facades' attributes, from
 * `city.pmtiles`). The map finds a building's evidence from its position in
 * the city tiles, which an address alone does not give, so until then only
 * these buildings can be opened from an address, and only with the stand-in
 * release.
 */
import * as z from "zod"

import { env } from "@/env"
import {
  capitalSlugSchema,
  evidenceBuildingSchema,
  evidenceParkSchema,
  facadeAttributesSchema,
  releaseNameSchema,
  standInRelease,
} from "@/data/schemas"
import type { BuildingRecord } from "@/lib/building"
import type { CapitalSlug } from "@/lib/capitals"
import stockholmFile from "@fixtures/buildings/stockholm.json"

const standInBuildingsSchema = z.object({
  // The release they were copied from
  release: releaseNameSchema,
  slug: capitalSlugSchema,
  // By building id
  buildings: z.record(
    z.string().regex(/^[1-9]\d*$/),
    z.object({
      // The evidence tile holding the building
      tile: z.tuple([z.literal(15), z.int(), z.int()]),
      // The green space its walk reaches, by its id in the tile
      parks: z.record(z.string(), evidenceParkSchema),
      building: evidenceBuildingSchema,
      facades: z.array(facadeAttributesSchema),
    })
  ),
})

const stockholm = standInBuildingsSchema.parse(stockholmFile)

/**
 * The record of a building of the stand-in release, or undefined when the
 * release in use is another one, or the building is not one of them
 */
export function standInBuilding(
  slug: CapitalSlug,
  id: number
): BuildingRecord | undefined {
  if (env.VITE_DATA_RELEASE !== standInRelease || slug !== stockholm.slug) {
    return undefined
  }
  const record = stockholm.buildings[id]
  if (!record) {
    return undefined
  }
  const { building, parks, facades } = record
  return {
    id,
    building,
    park: building.park === null ? null : (parks[building.park] ?? null),
    facades,
  }
}
