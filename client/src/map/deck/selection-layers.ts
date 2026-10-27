import type { Layer } from "@deck.gl/core"
import {
  PathStyleExtension,
  type PathStyleExtensionProps,
} from "@deck.gl/extensions"
import { PathLayer, ScatterplotLayer, SolidPolygonLayer } from "@deck.gl/layers"

import {
  circleRing,
  linePart,
  type DrawnFacade,
  type LngLat,
  type SightLine,
} from "@/lib/building-evidence"
import { withOpacity, type MapColors } from "@/map/map-colors"
import type { SelectionScene } from "./selection-motion"
import { screenOffset, type ScreenOffsetProps } from "./screen-offset-extension"

/*
 * A selected building's spotlight and evidence, in the reference's style:
 * - the veil over the street around it (street names stay over it);
 * - with the 3 trees rule, its facades that see 3 trees or more as thick,
 *   rounded lines in the Passes colour on its walls, lifted with it, each
 *   with a halo in the Surface colour (every halo under every line, so none
 *   cuts into the facade next to it, and facades meeting at a corner join);
 *   the trees they see, and dotted sight lines to them. A selected facade
 *   is thicker still, and the others are hidden. Every facade, drawn or
 *   not, can be clicked;
 * - with rule 30, the 500 m circle in Ink with a Surface halo, the land
 *   outside it quieter still, and the canopy inside it in full green (drawn
 *   with the street's tiles, masked by the circle);
 * - with rule 300, the dotted walk in Ink with a Surface halo, and the park
 *   in full green, lifted at the walk's end.
 */

/** Facade lines, in pixels: passing, selected, and the halo around each */
const facadeWidth = { passes: 6.5, selected: 10, halo: 4, ring: 4 }
/** What a finger or the pointer can hit of a facade, in pixels */
const facadeHit = 18
/** Sight lines: dots of 2 px, 5 px apart */
const sightWidth = 2
/** The walk: dots of 4 px, 8 px apart, on a 9 px halo */
const routeWidth = { line: 4, halo: 9 }
/** The 500 m circle: 2 px on a 6 px halo */
const ringWidth = { line: 2, halo: 6 }
/** Trees seen: their crowns 1.3 times the street's, with the same rim */
const treeRadius = 2.5 * 1.3
const treePixels = { min: 2, max: 7.3 }
const treeRim = 1.3
const treeShadowOffset = [2, 2.8] as const
/** The park lifting into view, and its shadow, in pixels */
const parkLift = 1.5
const parkShadow = [1.2, 2.4] as const

/** The id of the circle's mask, which the canopy inside it reads */
export const circleMaskId = "selection-circle"

/** The id of the layer whose facades can be clicked */
export const facadeHitId = "selection-facade-hit"

const dots = new PathStyleExtension({ dash: true, dashMode: "path" })

type Piece = { sid: number; path: Array<LngLat> }

const piecesOf = (facades: ReadonlyArray<DrawnFacade>): Array<Piece> =>
  facades.flatMap(({ sid, pieces }) => pieces.map((path) => ({ sid, path })))

/**
 * Every line shares one set of extensions, and every shape another, so
 * they share their shader programs: each program costs a pause the first
 * time it is drawn, seconds long on a slow device
 */
const pathExtensions = [screenOffset, dots]
const shapeExtensions = [screenOffset]

/** Lifted with the selected building, its offset changed in place */
const lifted = (offset: readonly [number, number]) => ({ screenOffset: offset })

export type SelectionLayers = {
  /** Under the selected building: the veil, then the evidence on the ground */
  under: Array<Layer | null>
  /** Over it: its facades, the trees they see, the circle */
  over: Array<Layer | null>
  /** The canopy inside the circle, drawn with the street's tiles */
  canopy?: { maskId: string; opacity: number }
  /** The building takes the Surface colour, so its facades stand out */
  surface: boolean
}

export function selectionLayers({
  scene,
  colors,
  offset,
  bounds,
  focusedFacade,
}: {
  scene: SelectionScene
  colors: MapColors
  /** The selected building's lift on screen, changed in place */
  offset: readonly [number, number]
  /** Everything the veil covers: west, south, east, north */
  bounds: readonly [number, number, number, number]
  /** The facade in keyboard focus */
  focusedFacade: number | undefined
}): SelectionLayers {
  const { shown } = scene
  const veil =
    scene.veil > 0 &&
    new SolidPolygonLayer({
      extensions: shapeExtensions,
      id: "selection-veil",
      data: [boxRing(bounds)],
      getPolygon: (ring: Array<LngLat>) => ring,
      getFillColor: colors.veil,
      opacity: scene.veil,
    })
  if (!shown) {
    return { under: [veil || null], over: [], surface: false }
  }
  const { building, rule, facade } = shown
  const evidence = scene.evidence

  if (rule === 30) {
    const circle = circleRing(building.centre)
    const shown30 = evidence * scene.circle
    return {
      under: [
        veil || null,
        new SolidPolygonLayer({
          extensions: shapeExtensions,
          id: circleMaskId,
          data: [circle],
          getPolygon: (ring: Array<LngLat>) => ring,
          operation: "mask",
        }),
        // Outside the circle, the land is quieter still
        new SolidPolygonLayer({
          extensions: shapeExtensions,
          id: "selection-outside",
          data: [[boxRing(bounds), circle]],
          getPolygon: (rings: Array<Array<LngLat>>) => rings,
          getFillColor: withOpacity(colors.surface, 0.55),
          opacity: shown30,
          visible: shown30 > 0,
        }),
      ],
      over: (["halo", "line"] as const).map(
        (part) =>
          new PathLayer<Array<LngLat>>({
            extensions: pathExtensions,
            id: `selection-circle-${part}`,
            data: [circle],
            getPath: (ring) => ring,
            getColor: part === "halo" ? colors.surface : colors.ink,
            getWidth: ringWidth[part],
            widthUnits: "pixels",
            opacity: shown30,
            visible: shown30 > 0,
          })
      ),
      canopy: { maskId: circleMaskId, opacity: shown30 },
      surface: false,
    }
  }

  if (rule === 300) {
    const route = building.route
      ? linePart(building.route, scene.route)
      : undefined
    const rise = scene.park
    const park = building.park
    return {
      under: [
        veil || null,
        park &&
          new SolidPolygonLayer({
            extensions: shapeExtensions,
            id: "selection-park-shadow",
            data: [park.ring],
            getPolygon: (ring: Array<LngLat>) => ring,
            getFillColor: colors.shadow,
            opacity: evidence * Math.min(1, rise),
            visible: rise > 0,
            ...lifted([parkShadow[0] * rise, parkShadow[1] * rise]),
          }),
        park &&
          new PathLayer<Array<LngLat>>({
            extensions: pathExtensions,
            id: "selection-park-edge",
            data: [park.ring],
            getPath: (ring) => ring,
            getColor: colors.treeRim,
            getWidth: 1,
            widthUnits: "pixels",
            opacity: evidence * Math.min(1, rise),
            visible: rise > 0,
            ...lifted([0, -parkLift * rise]),
          }),
        park &&
          new SolidPolygonLayer({
            extensions: shapeExtensions,
            id: "selection-park",
            data: [park.ring],
            getPolygon: (ring: Array<LngLat>) => ring,
            getFillColor: withOpacity(colors.tree, 0.9),
            opacity: evidence * Math.min(1, rise),
            visible: rise > 0,
            ...lifted([0, -parkLift * rise]),
          }),
        ...(route && route.length > 1
          ? (["halo", "line"] as const).map(
              (part) =>
                new PathLayer<
                  Array<LngLat>,
                  PathStyleExtensionProps<Array<LngLat>>
                >({
                  extensions: pathExtensions,
                  id: `selection-route-${part}`,
                  data: [route],
                  getPath: (line) => line,
                  getColor: part === "halo" ? colors.surface : colors.ink,
                  getWidth: routeWidth[part],
                  widthUnits: "pixels",
                  capRounded: true,
                  jointRounded: true,
                  opacity: evidence,
                  getDashArray: part === "line" ? [0, 2] : [0, 0],
                  updateTriggers: { getPath: scene.route },
                })
            )
          : []),
      ],
      over: [],
      surface: false,
    }
  }

  // The 3 trees rule: the facade selected, or the whole building
  const passing = building.facades.filter(({ passes }) => passes)
  const others = passing.filter(({ sid }) => sid !== facade)
  const chosen = building.facades.filter(({ sid }) => sid === facade)
  const othersShown = evidence * scene.others
  const pop = Math.max(0, scene.facades)
  const width =
    facadeWidth.passes +
    (facadeWidth.selected - facadeWidth.passes) * scene.thick
  const lines = (
    id: string,
    facades: ReadonlyArray<DrawnFacade>,
    lineWidth: number,
    opacity: number
  ) => {
    const pieces = piecesOf(facades)
    return {
      halo: new PathLayer<Piece>({
        extensions: pathExtensions,
        id: `selection-${id}-halo`,
        data: pieces,
        getPath: ({ path }) => path,
        getColor: colors.surface,
        getWidth: lineWidth + facadeWidth.halo,
        widthUnits: "pixels",
        widthScale: pop,
        capRounded: true,
        jointRounded: true,
        opacity,
        visible: opacity > 0 && pop > 0 && pieces.length > 0,
        updateTriggers: { getWidth: lineWidth },
        ...lifted(offset),
      }),
      line: new PathLayer<Piece>({
        extensions: pathExtensions,
        id: `selection-${id}`,
        data: pieces,
        getPath: ({ path }) => path,
        getColor: colors.passes,
        getWidth: lineWidth,
        widthUnits: "pixels",
        widthScale: pop,
        capRounded: true,
        jointRounded: true,
        opacity,
        visible: opacity > 0 && pop > 0 && pieces.length > 0,
        updateTriggers: { getWidth: lineWidth },
        ...lifted(offset),
      }),
    }
  }
  const othersLines = lines("facades", others, facadeWidth.passes, othersShown)
  const chosenLines = lines("facade", chosen, width, evidence)
  const focused = building.facades.filter(({ sid }) => sid === focusedFacade)

  return {
    under: [
      veil || null,
      sightLines("selection-sights", sightsOf(others), {
        colors,
        progress: scene.sights,
        opacity: othersShown,
      }),
      sightLines("selection-sight", sightsOf(chosen), {
        colors,
        progress: scene.sights,
        opacity: evidence,
      }),
    ],
    over: [
      ...treesSeen("selection-trees", sightsOf(others), {
        colors,
        pop: scene.trees,
        opacity: othersShown,
      }),
      ...treesSeen("selection-trees-facade", sightsOf(chosen), {
        colors,
        pop: scene.trees,
        opacity: evidence,
      }),
      // The keyboard's facade, ringed in Ink around its halo: the same ring
      // on a facade that is not drawn, the halo then filling it
      new PathLayer<Piece>({
        extensions: pathExtensions,
        id: "selection-facade-focus",
        data: piecesOf(focused),
        getPath: ({ path }) => path,
        getColor: colors.ink,
        getWidth:
          (focusedFacade === facade ? width : facadeWidth.passes) +
          facadeWidth.halo +
          facadeWidth.ring,
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
        visible: focused.length > 0,
        updateTriggers: { getWidth: [focusedFacade, width] },
        ...lifted(offset),
      }),
      new PathLayer<Piece>({
        extensions: pathExtensions,
        id: "selection-facade-focus-halo",
        data: piecesOf(focused),
        getPath: ({ path }) => path,
        getColor: colors.surface,
        getWidth:
          (focusedFacade === facade ? width : facadeWidth.passes) +
          facadeWidth.halo,
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
        visible: focused.length > 0,
        updateTriggers: { getWidth: [focusedFacade, width] },
        ...lifted(offset),
      }),
      othersLines.halo,
      chosenLines.halo,
      othersLines.line,
      chosenLines.line,
      // Every facade, passing or not, can be clicked
      new PathLayer<Piece>({
        extensions: pathExtensions,
        id: facadeHitId,
        data: piecesOf(building.facades),
        getPath: ({ path }) => path,
        getColor: [0, 0, 0, 0],
        getWidth: facadeHit,
        widthUnits: "pixels",
        capRounded: true,
        pickable: true,
      }),
    ],
    surface: true,
  }
}

/** The sight lines of some facades */
const sightsOf = (facades: ReadonlyArray<DrawnFacade>) =>
  facades.flatMap(({ sights }) => sights)

/** A rectangle as a closed ring */
function boxRing([west, south, east, north]: readonly [
  number,
  number,
  number,
  number,
]): Array<LngLat> {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ]
}

/** Dotted lines from each viewpoint to the tree it sees, drawing themselves */
function sightLines(
  id: string,
  sights: ReadonlyArray<SightLine>,
  {
    colors,
    progress,
    opacity,
  }: { colors: MapColors; progress: number; opacity: number }
) {
  return new PathLayer<SightLine, PathStyleExtensionProps<SightLine>>({
    id,
    data: [...sights],
    getPath: ({ from, tree }) => linePart([from, tree], progress),
    getColor: colors.passes,
    getWidth: sightWidth,
    widthUnits: "pixels",
    capRounded: true,
    getDashArray: [0, 2.5],
    extensions: pathExtensions,
    opacity,
    visible: opacity > 0 && progress > 0 && sights.length > 0,
    updateTriggers: { getPath: progress },
  })
}

/** The trees seen, popping in, with their rim and their shadow */
function treesSeen(
  id: string,
  sights: ReadonlyArray<SightLine>,
  { colors, pop, opacity }: { colors: MapColors; pop: number; opacity: number }
) {
  // Each tree once, however many viewpoints see it
  const trees = [
    ...new Map(sights.map(({ tree }) => [tree.join(), tree])).values(),
  ]
  const shown = opacity > 0 && pop > 0 && trees.length > 0
  const size = {
    data: trees,
    getPosition: (tree: LngLat) => tree,
    getRadius: treeRadius,
    radiusUnits: "meters" as const,
    radiusScale: Math.max(0, pop),
    opacity: opacity * Math.min(1, pop),
    visible: shown,
  }
  return [
    new ScatterplotLayer<LngLat, ScreenOffsetProps>({
      id: `${id}-shadow`,
      ...size,
      radiusMinPixels: treePixels.min + 0.2,
      radiusMaxPixels: treePixels.max + 0.2,
      getFillColor: colors.shadow,
      stroked: false,
      screenOffset: treeShadowOffset,
      extensions: shapeExtensions,
    }),
    new ScatterplotLayer<LngLat>({
      extensions: shapeExtensions,
      id,
      ...size,
      radiusMinPixels: treePixels.min,
      radiusMaxPixels: treePixels.max,
      getFillColor: colors.tree,
      stroked: true,
      getLineColor: colors.treeRim,
      getLineWidth: treeRim,
      lineWidthUnits: "pixels",
    }),
  ]
}
