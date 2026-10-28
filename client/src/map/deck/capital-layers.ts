import { COORDINATE_SYSTEM } from "@deck.gl/core"
import {
  PathStyleExtension,
  type PathStyleExtensionProps,
} from "@deck.gl/extensions"
import {
  PathLayer,
  ScatterplotLayer,
  SolidPolygonLayer,
  TextLayer,
} from "@deck.gl/layers"

import { fonts, motionDetails, typeScale } from "@/design/tokens"
import { fontFamily } from "@/design/tokens-css"
import type { CapitalSlug } from "@/lib/capitals"
import type { HomeCapital, LngLat } from "@/map/home-capitals"
import { withOpacity, type MapColors, type Rgba } from "@/map/map-colors"
import { screenOffset, type ScreenOffsetProps } from "./screen-offset-extension"

/*
 * The 27 capitals on the Home map: each enlarged outline in the Surface
 * colour, edged in Ink 2, with a short soft shadow, and its name under it.
 * The capital under the pointer, in keyboard focus or whose ranking row is
 * pointed at lifts, its shadow growing, and is edged in Ink (thicker in
 * focus); a clicked one wobbles once and sends out a ring. Outlines moved
 * away from a neighbour have a thin line back to their true position.
 *
 * Each capital has its own layers (shadow, fill, edge), so each can lift,
 * squash and sink on its own: its outline is drawn in metres around where it
 * is shown, and its `modelMatrix` enlarges (and squashes) it. As a capital
 * opens, the others sink and its outline grows into the city; back on Home,
 * they rise back into place.
 */

/** What moves on the capitals, frame by frame */
export type CapitalMotion = {
  /** How far each capital has risen: 0 at rest, 1 lifted (a spring) */
  lift: ReadonlyMap<CapitalSlug, number>
  /** The shape of the capital wobbling after a click */
  squash: { slug: CapitalSlug; x: number; y: number } | undefined
  /** The ring sent out by a click: its spread (a scale) and opacity */
  ring: PressRing | undefined
  /** The names' opacity: they show once the map is close enough */
  names: number
}

export type PressRing = { at: LngLat; scale: number; opacity: number }

/**
 * The capitals as the map leaves Home or comes back to it: how far each
 * other capital has dropped, shrunk and faded, the one opened (or left)
 * enlarged and moved from where Home shows it, and the leader lines' and
 * names' opacity
 */
export type CapitalsTransit = {
  away: ReadonlyMap<
    CapitalSlug,
    { drop: number; shrink: number; opacity: number }
  >
  grown:
    | { slug: CapitalSlug; scale: number; origin: LngLat; opacity: number }
    | undefined
  extras: number
}

/**
 * The names' font: its family, the characters of the names, and the
 * screen's device pixels per CSS pixel, which sets how its edges are
 * smoothed
 */
export type NameFont = {
  fontFamily: string
  characterSet: string
  pixelRatio: number
}

/*
 * How deck.gl draws the names: from a signed distance field of each
 * character, with the halo as its outline. The atlas is drawn at 32 px, near
 * the names' size, and the edges are smoothed over one device pixel: the
 * distance field holds 1/radius per atlas pixel, so half a device pixel is
 * half of atlas size / (text size × pixel ratio × radius). A lower cutoff
 * than deck.gl's 0.25 keeps the semibold weight at 11 px. Each character
 * keeps 8 atlas pixels around it, so letters that reach left of where they
 * start (Figtree's "j") are not cut.
 */
const nameAtlas = { fontSize: 32, radius: 6, buffer: 8, cutoff: 0.15 }
/** The halo, in atlas pixels: about 1.2 px on screen */
const nameHalo = 4

/**
 * The text settings of the names on the map, for a screen's pixel ratio and
 * the text's size (the capitals' names by default)
 */
export function nameTextSettings(
  pixelRatio: number,
  size: number = typeScale.mapName.size
) {
  const { fontSize, radius } = nameAtlas
  return {
    fontSettings: {
      ...nameAtlas,
      sdf: true,
      smoothing: (0.5 * fontSize) / (size * pixelRatio * radius),
    },
    outlineWidth: nameHalo,
  }
}

export const nameFontFamily = fontFamily(fonts.sans)

/** A capital's shadow, at rest and lifted, in pixels (from the mockup) */
const shadowAtRest = [1, 1.6] as const
const shadowLifted = [2.2, 4] as const
/** The edge's width at rest, lifted and in keyboard focus, in pixels */
const edgeWidth = { rest: 1.1, lifted: 1.6, focused: 2 } as const
/**
 * The leader lines: 0.9 px, dashes of 2 px with gaps of 2.5 px (deck.gl
 * counts them in line widths)
 */
const leaderWidth = 0.9
const leaderDashes: [number, number] = [2 / leaderWidth, 2.5 / leaderWidth]
const dashed = new PathStyleExtension({ dash: true })
/** The click ring's radius before it spreads, in pixels */
const ringRadius = 22

const mix = (from: number, to: number, amount: number) =>
  from + (to - from) * amount
const mixColor = (from: Rgba, to: Rgba, amount: number) =>
  from.map((value, index) => Math.round(mix(value, to[index], amount))) as Rgba
const unit = (value: number) => Math.min(1, Math.max(0, value))

type Polygon = { slug: CapitalSlug; rings: Array<Array<[number, number]>> }
type Ring = Array<[number, number]>

// The layers' data, made once per capital, so the layers redrawn on every
// frame of a motion never recompute their attributes
const shapes = new WeakMap<
  HomeCapital,
  { polygons: Array<Polygon>; areas: Array<Polygon>; rings: Array<Ring> }
>()
function shapesOf(capital: HomeCapital) {
  let shape = shapes.get(capital)
  if (!shape) {
    shape = {
      polygons: capital.outline.map((rings) => ({
        slug: capital.slug,
        rings,
      })),
      // Each polygon without its holes: the area the pointer can hover
      areas: capital.outline.map(([outer]) => ({
        slug: capital.slug,
        rings: [outer],
      })),
      rings: capital.outline.flat(),
    }
    shapes.set(capital, shape)
  }
  return shape
}

export type CapitalLayersInput = {
  capitals: ReadonlyArray<HomeCapital>
  colors: MapColors
  /** The capital in keyboard focus */
  focused: CapitalSlug | undefined
  motion: CapitalMotion
  /** Until the font is ready, the names wait */
  nameFont: NameFont | undefined
  /** As the map leaves Home or comes back to it */
  transit?: CapitalsTransit
}

/**
 * The layers of one capital: its shadow, its outline and its edge, and the
 * area the pointer hovers, drawn invisibly: the outline's outer edges with
 * no holes (Copenhagen around Frederiksberg), resting where the capital
 * rests, so neither a hole nor its lift and wobble move it from under the
 * pointer
 */
function capitalLayers(
  capital: HomeCapital,
  { colors, focused, motion, transit }: CapitalLayersInput
) {
  const away = transit?.away.get(capital.slug)
  const grown =
    transit?.grown?.slug === capital.slug ? transit.grown : undefined
  const opacity = away?.opacity ?? grown?.opacity ?? 1
  if (opacity <= 0) {
    return []
  }
  const lift = motion.lift.get(capital.slug) ?? 0
  const squash =
    motion.squash?.slug === capital.slug ? motion.squash : { x: 1, y: 1 }
  const { polygons, areas, rings } = shapesOf(capital)
  const drop = away?.drop ?? 0
  const rise = -motionDetails.liftMap * lift + drop
  const scale = (grown?.scale ?? capital.scale) * (away?.shrink ?? 1)
  const origin = grown?.origin ?? capital.display
  const placement = {
    coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS,
    coordinateOrigin: [origin[0], origin[1], 0] as [number, number, number],
    // Enlarged, and squashed about its centre while it wobbles
    modelMatrix: scaled(scale * squash.x, scale * squash.y),
    extensions: [screenOffset],
    opacity,
  }
  const edgeAmount = unit(lift)

  return [
    new SolidPolygonLayer<Polygon, ScreenOffsetProps>({
      ...placement,
      id: `capital-shadow-${capital.slug}`,
      data: polygons,
      getPolygon: (polygon: Polygon) => polygon.rings,
      getFillColor: withOpacity(
        colors.shadow,
        (colors.shadow[3] / 255) * (1 + 0.3 * edgeAmount)
      ),
      screenOffset: [
        mix(shadowAtRest[0], shadowLifted[0], lift),
        mix(shadowAtRest[1], shadowLifted[1], lift) + drop,
      ],
    }),
    new SolidPolygonLayer<Polygon, ScreenOffsetProps>({
      ...placement,
      id: `capital-${capital.slug}`,
      data: polygons,
      getPolygon: (polygon: Polygon) => polygon.rings,
      getFillColor: colors.surface,
      screenOffset: [0, rise],
    }),
    new PathLayer<Ring, ScreenOffsetProps>({
      ...placement,
      id: `capital-edge-${capital.slug}`,
      data: rings,
      getPath: (ring: Ring) => ring,
      getColor: mixColor(colors.ink2, colors.ink, edgeAmount),
      getWidth: mix(
        edgeWidth.rest,
        focused === capital.slug ? edgeWidth.focused : edgeWidth.lifted,
        edgeAmount
      ),
      widthUnits: "pixels",
      jointRounded: true,
      screenOffset: [0, rise],
    }),
    new SolidPolygonLayer<Polygon, ScreenOffsetProps>({
      ...placement,
      id: `capital-area-${capital.slug}`,
      data: areas,
      getPolygon: (polygon: Polygon) => polygon.rings,
      getFillColor: [0, 0, 0, 0],
      coordinateOrigin: [capital.display[0], capital.display[1], 0],
      modelMatrix: scaled(capital.scale, capital.scale),
      // Only on Home, at rest
      pickable: transit === undefined,
    }),
  ]
}

/** A matrix that enlarges a capital's outline, in metres, about its centre */
const scaled = (x: number, y: number) =>
  new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

/** Every layer of the capitals, from the leader lines to their names */
export function capitalsLayers(input: CapitalLayersInput) {
  const { capitals, colors, motion, nameFont, transit } = input
  const extras = transit?.extras ?? 1
  const moved = capitals.filter((capital) => capital.leader)
  // The capitals that rise come last, over their neighbours
  const byLift = [...capitals]
  byLift.sort(
    (a, b) => (motion.lift.get(a.slug) ?? 0) - (motion.lift.get(b.slug) ?? 0)
  )
  const liftKey = capitals
    .map((capital) => (motion.lift.get(capital.slug) ?? 0).toFixed(3))
    .join()

  return [
    // A thin dashed line from each moved capital's true position, with a
    // dot there
    new PathLayer<HomeCapital, PathStyleExtensionProps<HomeCapital>>({
      id: "capital-leaders",
      data: moved,
      getPath: (capital) => capital.leader as [LngLat, LngLat],
      getColor: withOpacity(colors.ink2, 0.8),
      getWidth: leaderWidth,
      widthUnits: "pixels",
      getDashArray: leaderDashes,
      extensions: [dashed],
      opacity: extras,
      visible: extras > 0,
    }),
    new ScatterplotLayer<HomeCapital>({
      id: "capital-leader-ends",
      data: moved,
      getPosition: (capital) => (capital.leader as [LngLat, LngLat])[0],
      getRadius: 2,
      radiusUnits: "pixels",
      getFillColor: colors.ink2,
      opacity: extras,
      visible: extras > 0,
    }),
    ...byLift.flatMap((capital) => capitalLayers(capital, input)),
    nameFont &&
      new TextLayer<HomeCapital>({
        id: "capital-names",
        data: capitals as Array<HomeCapital>,
        getPosition: (capital) => capital.bottom,
        getText: (capital) => capital.name,
        // Ink 2, and Ink as the capital lifts
        getColor: (capital) =>
          mixColor(
            colors.ink2,
            colors.ink,
            unit(motion.lift.get(capital.slug) ?? 0)
          ),
        getSize: typeScale.mapName.size,
        getTextAnchor: "middle",
        getAlignmentBaseline: "top",
        getPixelOffset: [0, 3],
        fontFamily: nameFont.fontFamily,
        fontWeight: typeScale.mapName.weight,
        characterSet: nameFont.characterSet,
        // A halo in the paper's colour
        ...nameTextSettings(nameFont.pixelRatio),
        outlineColor: colors.europeLand1,
        opacity: motion.names * extras,
        visible: motion.names * extras > 0,
        updateTriggers: { getColor: [liftKey, colors.ink.join()] },
      }),
  ]
}

/**
 * The ring a press sends out, spreading and fading: a clicked capital, drawn
 * even as its page opens, or a place of the city overview zoomed into
 */
export function pressRingLayer(ring: PressRing, colors: MapColors) {
  return new ScatterplotLayer<PressRing>({
    id: "press-ring",
    data: [ring],
    getPosition: (shown) => shown.at,
    getRadius: ringRadius * ring.scale,
    radiusUnits: "pixels",
    stroked: true,
    filled: false,
    getLineColor: withOpacity(colors.ink, ring.opacity),
    getLineWidth: 1.6,
    lineWidthUnits: "pixels",
  })
}
