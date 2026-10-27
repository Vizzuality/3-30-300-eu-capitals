import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

import { tileUrlTemplate } from "@/data/api"
import { evidenceTileSchema, type EvidenceTile } from "@/data/schemas"
import { env } from "@/env"
import {
  buildingSelection,
  childTiles,
  evidenceZoom,
  facadesZoom,
  partsBounds,
  tileAt,
  tilesCovering,
  type BuildingSelection,
  type BuildingTilePart,
  type TileAddress,
} from "@/lib/building-evidence"
import type { CapitalSlug } from "@/lib/capitals"
import { parseVisibleArea } from "@/lib/visible-area"
import { loadTile, tileUrl } from "@/map/deck/tile-decoder"

/*
 * A selected building, read from the capital's tiles: its evidence, from
 * the evidence tile (zoom 15) that holds it, and its place, outline and
 * facades, from the city tiles (zoom 16) it lies on. The panel and the map
 * read it from the same query, so they always show the same building.
 *
 * Which evidence tile holds a building comes from its representative point.
 * The map knows it for the buildings in view, and says so as one is
 * selected; a building opened from an address is looked for in the evidence
 * tiles of the area in view (`at`), the middle one first. Without that area
 * it cannot be found, and the page shows the map's view instead.
 */

/** The most evidence tiles looked through for a building of an address */
const searchedTiles = 16

/** The city tiles a building may need to be read whole, at most */
const buildingTiles = 16

const release = () => env.VITE_DATA_RELEASE

/** An evidence tile, or null where the archive has none */
export function evidenceTileQuery(slug: CapitalSlug, x: number, y: number) {
  return queryOptions({
    queryKey: ["evidence", release(), slug, x, y] as const,
    queryFn: async (): Promise<EvidenceTile | null> => {
      const url = tileUrl(
        tileUrlTemplate({ kind: "evidence", slug }, release()),
        { z: evidenceZoom, x, y }
      )
      const response = await fetch(url)
      if (response.status === 204) {
        return null
      }
      if (!response.ok) {
        throw new Error(`The data API answered ${response.status} for ${url}`)
      }
      return evidenceTileSchema.parse(await response.json())
    },
    staleTime: "static",
  })
}

/** Where a building's evidence is: the column and row of its evidence tile */
export type EvidenceTilePlace = { x: number; y: number }

/**
 * The evidence tile of a building: told by the map, or looked for in the
 * area in view of an address; null when it is not there
 */
export function buildingTileQuery(
  slug: CapitalSlug,
  id: number,
  find: () => Promise<EvidenceTilePlace | null> = async () => null
) {
  return queryOptions({
    queryKey: ["building-tile", release(), slug, id] as const,
    queryFn: find,
    staleTime: "static",
  })
}

/** Everything the panel and the map need of a building */
export function buildingQuery(
  slug: CapitalSlug,
  id: number,
  tile: EvidenceTilePlace | null | undefined,
  evidence: (x: number, y: number) => Promise<EvidenceTile | null>
) {
  return queryOptions({
    queryKey: ["building", release(), slug, id, tile?.x, tile?.y] as const,
    queryFn: async (): Promise<BuildingSelection | null> => {
      if (!tile) {
        return null
      }
      const content = await evidence(tile.x, tile.y)
      if (!content?.buildings[String(id)]) {
        return null
      }
      const parts = await buildingParts(slug, id, tile)
      return buildingSelection(content, id, parts)
    },
    staleTime: "static",
  })
}

const tileKey = ({ x, y }: TileAddress) => `${x}/${y}`

/**
 * What the city tiles hold of a building: those under its evidence tile
 * first, then those its outline reaches into, until it is whole (each tile
 * also holds a margin of its neighbours). Never further from its evidence
 * tile than `buildingTiles` tiles reach, whatever bounds the tiles say.
 */
async function buildingParts(
  slug: CapitalSlug,
  id: number,
  tile: EvidenceTilePlace
) {
  const template = tileUrlTemplate({ kind: "city", slug }, release())
  const read = new Map<string, BuildingTilePart>()
  const near = { x: tile.x * 2, y: tile.y * 2, reach: buildingTiles + 1 }
  let next = childTiles({ z: evidenceZoom, ...tile })
  while (next.length > 0 && read.size < buildingTiles) {
    const parts = await Promise.all(
      next.map(
        async (index) =>
          ((await loadTile(tileUrl(template, index), index, {
            kind: "building",
            id,
          })) as BuildingTilePart | null) ?? { place: null, facades: [] }
      )
    )
    for (const [at, part] of parts.entries()) {
      read.set(tileKey(next[at]), part)
    }
    const bounds = partsBounds(read.values())
    next = bounds
      ? tilesCovering(bounds, facadesZoom, near).filter(
          (index) => !read.has(tileKey(index))
        )
      : []
  }
  return [...read.values()]
}

/**
 * The evidence tiles of an area, the one at its middle first, at most
 * `searchedTiles`
 */
export function searchOrder(at: string): Array<EvidenceTilePlace> {
  const area = parseVisibleArea(at)
  if (!area) {
    return []
  }
  const middle = tileAt(
    [(area.west + area.east) / 2, (area.south + area.north) / 2],
    evidenceZoom
  )
  // The nearest tiles lie within `searchedTiles - 1` of the middle, whatever
  // the area's shape: a tile further away has `searchedTiles` tiles nearer,
  // on the way to it
  const tiles = tilesCovering(
    [area.west, area.south, area.east, area.north],
    evidenceZoom,
    { x: middle.x, y: middle.y, reach: searchedTiles - 1 }
  )
  const distance = ({ x, y }: TileAddress) =>
    Math.hypot(x - middle.x, y - middle.y)
  tiles.sort((a, b) => distance(a) - distance(b))
  return tiles.slice(0, searchedTiles).map(({ x, y }) => ({ x, y }))
}

/** The evidence tile of the place given, for the map to tell */
export const evidenceTileOf = (place: [number, number]): EvidenceTilePlace => {
  const { x, y } = tileAt(place, evidenceZoom)
  return { x, y }
}

/**
 * The building selected on a capital's page, as soon as its tiles are read:
 * undefined while they are, or when there is none; null when the address
 * names a building that cannot be found
 */
export function useBuildingSelection({
  slug,
  id,
  at,
  enabled,
}: {
  slug: CapitalSlug
  id: number | undefined
  /** The area in view of the address, where a building is looked for */
  at: string | undefined
  /** Whether the release has the capital's evidence */
  enabled: boolean
}): BuildingSelection | null | undefined {
  const queryClient = useQueryClient()
  const evidence = useCallback(
    (x: number, y: number) => queryClient.query(evidenceTileQuery(slug, x, y)),
    [queryClient, slug]
  )
  const find = async () => {
    for (const tile of searchOrder(at ?? "")) {
      const content = await evidence(tile.x, tile.y)
      if (id !== undefined && content?.buildings[String(id)]) {
        return tile
      }
    }
    return null
  }
  const tile = useQuery({
    ...buildingTileQuery(slug, id ?? 0, find),
    enabled: enabled && id !== undefined,
  })
  const building = useQuery({
    ...buildingQuery(slug, id ?? 0, tile.data, evidence),
    enabled: enabled && id !== undefined && tile.data !== undefined,
  })
  if (!enabled || id === undefined) {
    return undefined
  }
  if (tile.data === null || tile.isError || building.isError) {
    return null
  }
  return building.data
}
