import { COORDINATE_SYSTEM } from "@deck.gl/core"
import { TileLayer } from "@deck.gl/geo-layers"
import { PathLayer, SolidPolygonLayer } from "@deck.gl/layers"

import type { Capital } from "@/data/schemas"
import { withOpacity, type MapColors } from "@/map/map-colors"

/*
 * What the map draws until the Home map and the city maps arrive: the sea
 * over the area of the Home map, the outlines of deck.gl's map tiles, which
 * keep about the same size on screen at every zoom, and on a capital's
 * page the city's outline, so the camera's moves can be followed. Every
 * colour comes from the design tokens.
 */

type Ring = Array<[number, number]>

/** The area of the Home map: west, south, east, north */
const homeFrame: Ring = [
  [-32, 24],
  [50, 24],
  [50, 73],
  [-32, 73],
  [-32, 24],
]

export type BaseLayersInput = {
  colors: MapColors
  /** The capital shown, on its page */
  city: Pick<Capital, "slug" | "centre" | "outline"> | undefined
}

export function baseLayers({ colors, city }: BaseLayersInput) {
  // The outline is in metres around the city's centre
  const cityPlacement = city && {
    coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS,
    coordinateOrigin: [city.centre[0], city.centre[1], 0] as [
      number,
      number,
      number,
    ],
  }
  const gridColor = withOpacity(colors.waterLines, 0.4)

  return [
    new SolidPolygonLayer<Ring>({
      id: "sea",
      data: [homeFrame],
      getPolygon: (ring) => ring,
      getFillColor: colors.europeSea,
    }),
    city &&
      new SolidPolygonLayer<Array<Ring>>({
        id: `city-${city.slug}`,
        data: city.outline,
        getPolygon: (rings) => rings,
        getFillColor: colors.land,
        ...cityPlacement,
      }),
    // Each tile in view, outlined: a grid that follows every move
    new TileLayer<Ring>({
      id: "tile-grid",
      tileSize: 256,
      getTileData: ({ bbox }) => {
        const { west, south, east, north } = bbox as {
          west: number
          south: number
          east: number
          north: number
        }
        return [
          [west, north],
          [east, north],
          [east, south],
        ]
      },
      renderSubLayers: ({ id, data }) =>
        new PathLayer<Ring>({
          id,
          data: data ? [data] : [],
          getPath: (path) => path,
          getColor: gridColor,
          getWidth: 1,
          widthUnits: "pixels",
        }),
    }),
    city &&
      new PathLayer<Ring>({
        id: `city-edge-${city.slug}`,
        data: city.outline.flat(),
        getPath: (ring) => ring,
        getColor: colors.ink2,
        getWidth: 1,
        widthUnits: "pixels",
        ...cityPlacement,
      }),
  ]
}
