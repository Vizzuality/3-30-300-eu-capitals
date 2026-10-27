import { GeoJsonLayer } from "@deck.gl/layers"
import type { Layer } from "@deck.gl/core"

import { tileUrlTemplate } from "@/data/api"
import type { CapitalSlug } from "@/lib/capitals"
import { withOpacity, type MapColors, type Rgba } from "@/map/map-colors"
import type { BinaryFeatures, CityTileContent } from "./city-tile-decode"
import { CityTileLayer } from "./city-tile-layer"
import { HideExtension, type HiddenIds } from "./hide-extension"
import { RevealExtension, type RevealClock } from "./reveal-extension"
import { screenOffset } from "./screen-offset-extension"
import { StippleExtension } from "./stipple-extension"

/*
 * The street level, in the illustrated style of the reference, drawn from
 * the capital's city tiles: water with its shallows, shore lines and hatch
 * marks, parks with their stipple, the canopy, the streets, the buildings in
 * the colour of the rules they meet with their short shadows, and the trees.
 * Sizes on the ground (street widths, tree crowns, the stipple) are in
 * metres, converted to deck.gl's common units at the capital's latitude: a
 * tile's features are drawn in its own coordinates, where deck.gl takes
 * metres for common units. Line widths are in pixels.
 *
 * The buildings under the pointer or in keyboard focus are drawn again,
 * lifted, by a group of their own over the others, with a longer shadow;
 * their resting copies are left out (`HideExtension`).
 */

/** The zooms of the city tiles drawn at street level */
export const streetTileZooms = { min: 14, max: 16 } as const

/** Street widths on the ground, in metres: the street and its casing */
const streetWidth = 6
const casingWidth = 7.6
/** Tree crowns: 2.5 m across on the ground, kept between these on screen */
const treeRadius = 2.5
const treePixels = { min: 1.5, max: 5.6 }
const treeRim = 1.3
/** The tree shadow: 0.2 px larger than the crown, shifted (x right, y down) */
const treeShadowOffset = [2, 2.8] as const
/** The building shadow at rest, shifted in pixels */
export const buildingShadowOffset = [0.9, 1.4] as const
/** The park stipple: 0.7 m dots, two per 6 m square on the diagonal */
const stipple = { radius: 0.7, cell: 6 }
/** Building edges: a shade of their colour towards a dark brown */
const edgeShade = { scored: 0.32, unscored: 0.2 }
const edgeWidth = { scored: 0.7, unscored: 0.6 }
const edgeBrown: Rgba = [0x24, 0x1a, 0x12, 255]

/** Web Mercator's sphere, in metres */
const EARTH_RADIUS = 6_378_137

/** deck.gl's common units (512 for the world) in a metre at a latitude */
export function commonPerMetre(latitude: number) {
  return (
    512 / (2 * Math.PI * EARTH_RADIUS * Math.cos((latitude * Math.PI) / 180))
  )
}

const mix = (from: Rgba, to: Rgba, amount: number): Rgba => [
  Math.round(from[0] + (to[0] - from[0]) * amount),
  Math.round(from[1] + (to[1] - from[1]) * amount),
  Math.round(from[2] + (to[2] - from[2]) * amount),
  255,
]

type Feature = { properties: Record<string, number> }

/**
 * A place for a building lifted over the others, and how far it has risen;
 * changed in place, read as the layers are drawn
 */
export type LiftedBuilding = {
  /** −1 while empty */
  id: number
  /** The building's screen offset and its shadow's, mutated as it rises */
  offset: [number, number]
  shadow: [number, number]
  /** In keyboard focus: its edge is the 2 px focus ring */
  focused: boolean
  /** Its id, alone, for its copy to show only it */
  only: HiddenIds
}

export type StreetLayersInput = {
  slug: CapitalSlug
  release: string
  colors: MapColors
  /** Where the city tiles are: the city and its 1 km band */
  extent: readonly [number, number, number, number]
  /** The capital's latitude, for sizes on the ground */
  latitude: number
  reveal: RevealClock
  hidden: HiddenIds
  lifted: ReadonlyArray<LiftedBuilding>
  /** How far apart the waves of the arrival are, in pixels */
  waveSpacing: number
  /** Called with the tiles in view once they are loaded */
  onTilesLoaded: (tiles: Array<CityTileContent>) => void
}

export type SubLayerProps = Record<string, unknown> & {
  id: string
  data: CityTileContent | null
  tile: { index: { x: number; y: number; z: number } }
  extensions?: Array<unknown>
}

/**
 * One source layer of a tile, drawn by a `GeoJsonLayer` that keeps
 * `MVTLayer`'s tile placement and its clip extension (without it each tile
 * also draws its buffer, and the edges where the tiles were cut show)
 */
export function sub(
  props: SubLayerProps,
  name: string,
  data: BinaryFeatures | undefined,
  style: Record<string, unknown> & { extensions?: Array<unknown> }
) {
  if (!data) {
    return null
  }
  const { data: _data, tile: _tile, id, ...rest } = props
  return new GeoJsonLayer({
    ...rest,
    ...style,
    id: `${id}-${name}`,
    data: data as never,
    extensions: [...(props.extensions ?? []), ...(style.extensions ?? [])],
  } as never)
}

// The extensions, one instance each for every layer
const stippleDots = new StippleExtension()
const hide = new HideExtension()
const revealArea = new RevealExtension("area")
const revealBuildings = new RevealExtension("features")
const revealTrees = new RevealExtension("points")

/**
 * Where a tile lies in the park stipple: its corner's place in the
 * pattern's square cell and the metres in one unit of the tile, from one
 * scale for the whole capital (as every size on the ground), so the pattern
 * is fixed to the ground and lines up across tiles and zooms
 */
function stippleOf(
  { x, y, z }: { x: number; y: number; z: number },
  latitude: number
) {
  const metresPerUnit = 512 / 2 ** z / commonPerMetre(latitude)
  const inCell = (value: number) =>
    ((value % stipple.cell) + stipple.cell) % stipple.cell
  return {
    stippleOrigin: [inCell(x * metresPerUnit), inCell(y * metresPerUnit)] as [
      number,
      number,
    ],
    stippleScale: metresPerUnit,
    stippleCell: stipple.cell,
    stippleRadius: stipple.radius,
  }
}

/** A building's representative point in its tile's own coordinates */
function tileCentre({ x, y, z }: { x: number; y: number; z: number }) {
  const n = 2 ** z
  return (feature: Feature): [number, number, number] => {
    const { cx, cy } = feature.properties
    const tileX = ((cx + 180) / 360) * n - x
    const latitude = (cy * Math.PI) / 180
    const tileY = ((1 - Math.asinh(Math.tan(latitude)) / Math.PI) / 2) * n - y
    return [tileX, tileY, 0]
  }
}

/**
 * The rings of the arrival, in which the overview gives way and the
 * street's ground appears: six rings, half a wave apart, 70 ms apart
 */
export const arrivalRings = (reveal: RevealClock, waveSpacing: number) => ({
  revealClock: reveal,
  revealSpacing: waveSpacing / 2,
  revealWaves: 6,
  revealWaveDelay: 70,
  revealDuration: 240,
})

/** The overview's grid, water and edge, giving way to the street */
export const revealOverview = new RevealExtension("area")

const buildingsOf = (props: SubLayerProps) => props.data?.layers.buildings

/** Not drawn */
const transparent: Rgba = [0, 0, 0, 0]

/** No shift on screen */
const atRest = [0, 0] as const

/** A lifted copy: its one building, from the tiles, by its id */
const onlyThis = (only: HiddenIds, props: SubLayerProps) => ({
  hiddenIds: only,
  hideOthers: true,
  getHideId: (feature: Feature) => feature.properties.id,
  getRevealCentre: tileCentre(props.tile.index),
})

export function streetLayers(input: StreetLayersInput): Array<Layer | null> {
  const { colors, latitude, reveal, hidden, lifted, waveSpacing } = input
  // The resting copies left out are those of the buildings lifted by these
  // layers, and the layers of an empty place are not drawn: both change
  // together, as the layers are made
  hidden.ids = [
    lifted[0]?.id ?? -1,
    lifted[1]?.id ?? -1,
    lifted[2]?.id ?? -1,
    -1,
  ]
  const inUse = lifted.map(({ id }) => id !== -1)
  const unit = commonPerMetre(latitude)
  const results = [
    colors.result0,
    colors.result1,
    colors.result2,
    colors.result3,
  ]
  const darkest: Rgba = colors.ink[0] > 128 ? [0, 0, 0, 255] : edgeBrown
  const edges = results.map((color) => mix(color, darkest, edgeShade.scored))
  const neutralEdge = mix(colors.building, darkest, edgeShade.unscored)
  const fillOf = (feature: Feature) =>
    feature.properties.scored === 1
      ? (results[feature.properties.score] ?? colors.building)
      : colors.building
  const scheme = colors.result0.join()

  // The arrival: the street's ground appears in rings, buildings pop in
  // three waves and trees in one, after them
  const ring = arrivalRings(reveal, waveSpacing)
  const pop = {
    revealClock: reveal,
    revealSpacing: waveSpacing,
    revealWaves: 3,
    revealWaveDelay: 120,
    revealDelay: 120,
  }
  const treePop = { ...pop, revealWaves: 1, revealDelay: 120 + 3 * 120 }
  const treeSize = {
    pointType: "circle",
    getPointRadius: treeRadius * unit,
    pointRadiusUnits: "common",
    pointRadiusMinPixels: treePixels.min,
    pointRadiusMaxPixels: treePixels.max,
  }
  const group = (
    id: string,
    render: (
      props: SubLayerProps,
      layers: CityTileContent["layers"]
    ) => Array<Layer | null>,
    extra: Record<string, unknown> = {}
  ) =>
    new CityTileLayer({
      id: `street-${id}-${input.slug}`,
      data: tileUrlTemplate({ kind: "city", slug: input.slug }, input.release),
      minZoom: streetTileZooms.min,
      maxZoom: streetTileZooms.max,
      // Below its first zoom, its first tiles, drawn smaller
      extent: [...input.extent],
      pickable: false,
      updateTriggers: { renderSubLayers: [scheme] },
      renderSubLayers: (props: unknown) => {
        const subProps = props as SubLayerProps
        return subProps.data ? render(subProps, subProps.data.layers) : null
      },
      ...extra,
    } as never)

  const ground = group("ground", (props, layers) => {
    const shown = { ...ring, revealDirection: 1, extensions: [revealArea] }
    return [
      sub(props, "land", layers.land, {
        ...shown,
        stroked: false,
        getFillColor: colors.land,
      }),
      // Parks and canopy under the water: a park's outline often takes in
      // its ponds, and crowns reach over the shore
      sub(props, "parks", layers.parks, {
        ...shown,
        stroked: false,
        getFillColor: colors.park,
        ...stippleOf(props.tile.index, latitude),
        stippleColor: withOpacity(colors.treeRim, 0.5),
        extensions: [stippleDots, revealArea],
      }),
      sub(props, "canopy", layers.canopy, {
        ...shown,
        stroked: false,
        getFillColor: withOpacity(colors.tree, 0.3),
      }),
      // The whole water body in the Shallows colour, then open water over
      // it: two passes over the same features, each drawing one kind (the
      // tiles list them in no particular order)
      sub(props, "shallows", layers.water, {
        ...shown,
        stroked: false,
        getFillColor: (feature: Feature) =>
          feature.properties.kind === 0 ? colors.shallows : transparent,
        updateTriggers: { getFillColor: scheme },
      }),
      sub(props, "water", layers.water, {
        ...shown,
        stroked: false,
        getFillColor: (feature: Feature) =>
          feature.properties.kind === 1 ? colors.water : transparent,
        updateTriggers: { getFillColor: scheme },
      }),
      sub(props, "marks", layers.water_marks, {
        ...shown,
        getLineColor: withOpacity(colors.waterLines, 0.38),
        getLineWidth: 0.9,
        lineWidthUnits: "pixels",
        lineCapRounded: true,
      }),
      // The coast, then two ripples 13 m and 24 m in
      sub(props, "shore", layers.shore, {
        ...shown,
        getLineColor: (feature: Feature) =>
          withOpacity(
            colors.waterLines,
            [1, 0.7, 0.4][feature.properties.kind] ?? 1
          ),
        getLineWidth: (feature: Feature) => (feature.properties.kind ? 0.8 : 1),
        lineWidthUnits: "pixels",
        updateTriggers: { getLineColor: scheme },
      }),
      sub(props, "casing", layers.streets, {
        ...shown,
        getLineColor: colors.streetCasing,
        getLineWidth: casingWidth * unit,
        lineWidthUnits: "common",
        lineCapRounded: true,
        lineJointRounded: true,
      }),
      sub(props, "streets", layers.streets, {
        ...shown,
        getLineColor: colors.street,
        getLineWidth: streetWidth * unit,
        lineWidthUnits: "common",
        lineCapRounded: true,
        lineJointRounded: true,
      }),
    ]
  })

  const shadows = group("shadows", (props, layers) => [
    sub(props, "buildings", layers.buildings, {
      ...pop,
      stroked: false,
      getFillColor: colors.shadow,
      screenOffset: buildingShadowOffset,
      getRevealCentre: tileCentre(props.tile.index),
      hiddenIds: hidden,
      getHideId: (feature: Feature) => feature.properties.id,
      extensions: [revealBuildings, hide, screenOffset],
    }),
    sub(props, "trees", layers.trees, {
      ...treeSize,
      ...treePop,
      pointRadiusMinPixels: treePixels.min + 0.2,
      pointRadiusMaxPixels: treePixels.max + 0.2,
      stroked: false,
      getFillColor: colors.shadow,
      screenOffset: treeShadowOffset,
      extensions: [revealTrees, screenOffset],
    }),
  ])

  const objects = group(
    "objects",
    (props, layers) => [
      sub(props, "buildings", layers.buildings, {
        ...pop,
        pickable: true,
        getFillColor: fillOf,
        getLineColor: (feature: Feature) =>
          feature.properties.scored === 1
            ? (edges[feature.properties.score] ?? neutralEdge)
            : neutralEdge,
        getLineWidth: (feature: Feature) =>
          feature.properties.scored === 1
            ? edgeWidth.scored
            : edgeWidth.unscored,
        lineWidthUnits: "pixels",
        lineJointRounded: true,
        getRevealCentre: tileCentre(props.tile.index),
        hiddenIds: hidden,
        getHideId: (feature: Feature) => feature.properties.id,
        updateTriggers: { getFillColor: scheme, getLineColor: scheme },
        // At rest, on the same shader program as the shadows and the lifts
        screenOffset: atRest,
        extensions: [revealBuildings, hide, screenOffset],
      }),
      sub(props, "trees", layers.trees, {
        ...treeSize,
        ...treePop,
        pickable: false,
        getFillColor: colors.tree,
        stroked: true,
        getLineColor: colors.treeRim,
        getLineWidth: treeRim,
        lineWidthUnits: "pixels",
        screenOffset: atRest,
        extensions: [revealTrees, screenOffset],
      }),
    ],
    {
      pickable: true,
      onViewportLoad: (loaded: Array<{ content: CityTileContent | null }>) =>
        input.onTilesLoaded(
          loaded.flatMap(({ content }) => (content ? [content] : []))
        ),
    }
  )

  // The lifted buildings: each a copy of its building, filtered from the
  // tiles by its id, over the others, its shadow a group of its own (two
  // layers shifted by different offsets never share a group, or a shadow
  // from one tile is drawn over the building lifted from the next)
  const liftTriggers = {
    updateTriggers: { renderSubLayers: [scheme, inUse.join()] },
  }
  const liftShadows = group(
    "lift-shadows",
    (props) =>
      lifted.map(({ only, shadow }, index) =>
        sub(props, `shadow-${index}`, buildingsOf(props), {
          ...onlyThis(only, props),
          visible: inUse[index],
          stroked: false,
          getFillColor: colors.shadow,
          screenOffset: shadow,
          extensions: [revealBuildings, hide, screenOffset],
        })
      ),
    liftTriggers
  )
  const lifts = group(
    "lifts",
    (props) =>
      lifted.map(({ only, offset, focused }, index) =>
        sub(props, `lift-${index}`, buildingsOf(props), {
          ...onlyThis(only, props),
          visible: inUse[index],
          getFillColor: fillOf,
          getLineColor: colors.ink,
          getLineWidth: focused ? 2 : 1,
          lineWidthUnits: "pixels",
          lineJointRounded: true,
          screenOffset: offset,
          updateTriggers: { getFillColor: scheme },
          extensions: [revealBuildings, hide, screenOffset],
        })
      ),
    liftTriggers
  )

  return [
    ground,
    shadows,
    objects,
    // Always there, with their tiles loaded, and the same layers whatever
    // buildings they lift: a lifted copy is drawn in the very frame its
    // resting copy is left out
    liftShadows,
    lifts,
  ]
}
