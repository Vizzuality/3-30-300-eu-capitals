import { animate, type AnimationPlaybackControls } from "motion"
import { useEffect, useLayoutEffect, useState } from "react"

import { prefersReducedMotion } from "@/design/reduced-motion"
import { motionDetails, motionTokens } from "@/design/tokens"
import { toReducedFade, transitions } from "@/design/tokens-motion"
import type { CityOutline } from "@/data/schemas"
import type { CapitalSlug } from "@/lib/capitals"
import { viewportOf } from "@/map/camera"
import type { HomeCapital } from "@/map/home-capitals"
import type { MapCamera } from "@/map/map-camera"
import type { CapitalMap } from "@/map/renderer"
import {
  eased,
  grownOrigin,
  grownScale,
  rippleShares,
  springAt,
  type MapTransition,
} from "@/map/view-transition"
import type { CapitalsTransit } from "./capital-layers"
import { makeRevealClock } from "./reveal-extension"

/*
 * The map's transitions between places, frame by frame (see
 * `view-transition.ts` for what each one does):
 * - opening a capital from Home: the capitals left behind sink in a ripple
 *   outwards, their names and leader lines fade; the capital opened keeps
 *   its size on screen as the camera flies in, then grows with the map
 *   (`grownScale`), moving to where the city really is. Once it has its
 *   true size the real city takes its place: its ground, its limits and its
 *   shadow under the outline, its soft rings fading in, while Europe fades
 *   out. Once the camera has landed, the grid (with the water and the main
 *   roads over it) opens from the centre, then the district names fade in;
 * - leaving a city (for another, or for Home), the whole map sinks and
 *   fades, as one sheet (the stage holding the canvas);
 * - back on Home, Europe fades in as the camera flies out, the capital left
 *   shrinks back to its Home size, and the others rise back into place,
 *   rippling outwards from it;
 * - opening a capital from another, once the camera has jumped there, the
 *   map lifts into place and the city's shadow grows;
 * - a city whose limits arrive while its page shows (its page opened
 *   directly) finishing loading: its limits draw themselves, then its soft
 *   rings, its ground, the rest of the city (the grid, the water, the roads
 *   and the names, popping in once the grid is drawn) and its shadow.
 * Under reduced motion each arrives as a fade of at most 280 ms, and the
 * camera jumps.
 *
 * It lives outside React, as the camera does: its values change on every
 * frame, and the layers read them as they are made (`redraw` is called on
 * every frame of a transition).
 */

/** A capital's city on its overview, as it arrives: 1 everywhere at rest */
export type CityShow = {
  /** The city's ground */
  ground: number
  /** Its limit line, and how much of it is drawn (1, the whole) */
  limits: number
  drawn: number
  /** Its shadow, and how far it has grown out from under the city */
  shadow: number
  shadowOut: number
  /** Its soft rings */
  rings: number
  /** The grid, the water and the main roads */
  content: number
  /** The district names */
  names: number
  /** The grid opening from the centre, with the water and roads over it */
  opening: Record<string, unknown> | undefined
}

/** What the map draws, as of now */
export type ViewInput = {
  transition: MapTransition | undefined
  onTransitionEnd: ((id: number) => void) | undefined
  /** The capitals, on Home */
  home: ReadonlyArray<HomeCapital> | undefined
  /** The capital shown, on its page */
  capital: CapitalMap | undefined
  /** Its limits, once loaded; null when the release has none */
  city: CityOutline | null | undefined
  /** Whether the capital's grid has drawn the area in view */
  gridDrawn: boolean
  onStreet: boolean
  /** What holds the canvas: it sinks and lifts as one sheet */
  stage: { current: HTMLElement | null }
}

const atRest = (): CityShow => ({
  ground: 1,
  limits: 1,
  drawn: 1,
  shadow: 1,
  shadowOut: 1,
  rings: 1,
  content: 1,
  names: 1,
  opening: undefined,
})

/** Hidden: the parts of the city that wait for it to arrive */
const waiting = {
  ground: 0,
  limits: 0,
  shadow: 0,
  rings: 0,
  content: 0,
  names: 0,
}

/** The grid's opening: its rings, how far apart they start, their fade */
const opening = { rings: 48, apart: 20, fade: 160 }

/** When the soft rings of a city lifting into place fade in */
const ringsAfterLift = 250

const fade = (time: number, duration: number = motionTokens.fade.duration) =>
  eased(motionTokens.fade.curve, time / duration)
const reducedFade = (time: number) => fade(time, motionDetails.reducedFade)

type Away = { drop: number; shrink: number; opacity: number }

type Run = {
  id: number
  kind: MapTransition["kind"]
  phase: MapTransition["phase"]
  start: number
  reduced: boolean
  /** The camera's last move as the transition started */
  request: number | undefined
  /** The camera's zoom on Home, as it leaves it or as it lands there */
  homeZoom?: number
  /** The capital opened from Home, or left for Home */
  chosen?: HomeCapital
  shares?: Map<CapitalSlug, number>
  /** When the real city took the outline's place, then when it opened */
  handOver?: number
  opened?: number
  /** Opening from another capital: when it lifted into place */
  lifted?: number
  /**
   * Arriving, the stage waits, hidden, for the map to have drawn the new
   * place where the camera now is, so the place left never shows again
   */
  waitsForDraw?: boolean
  done?: boolean
}

type Load = {
  /**
   * When its parts start to arrive: once the map has drawn them a first
   * time, hidden, so the time taken to make their layers is not skipped
   */
  start: number | undefined
  reduced: boolean
  /** When the rest of the city pops in, once the grid is drawn */
  content?: number
}

export class ViewMotion {
  /** The map of Europe's opacity */
  europe = 1
  /** The capitals left behind as a capital opens from Home */
  leftBehind: ReadonlyArray<HomeCapital> | undefined
  /** How the capitals move as the map leaves Home or comes back to it */
  transit: CapitalsTransit | undefined
  city: CityShow = atRest()

  private input: ViewInput | undefined
  private clock = makeRevealClock()
  // The capitals as Home last showed them, left behind as a capital opens
  private lastHome: ReadonlyArray<HomeCapital> | undefined
  private run: Run | undefined
  private load: Load | undefined
  // The city shown, with no transition to show it, waits for its limits
  private pending = false
  private shownCity: CapitalSlug | undefined
  private frame = 0
  private sheet: AnimationPlaybackControls | undefined

  constructor(
    private camera: MapCamera,
    private redraw: () => void
  ) {}

  /** What the map draws now: a transition starts, moves on, or ends */
  update(input: ViewInput) {
    const before = this.input
    this.input = input
    if (input.home) {
      this.lastHome = input.home
    }
    const { transition } = input
    const changed =
      transition?.id !== before?.transition?.id ||
      transition?.phase !== before?.transition?.phase ||
      transition?.ready !== before?.transition?.ready
    if (changed) {
      this.transitionChanged()
    }
    const slug = input.capital?.slug
    const city = input.city === null ? null : input.city?.slug
    const previous = before?.city === null ? null : before?.city?.slug
    if (changed || slug !== before?.capital?.slug || city !== previous) {
      this.cityChanged()
    }
  }

  /**
   * The map has drawn a frame: a city finishing loading starts to arrive,
   * its parts now made; arriving, once the map shows the new place where
   * the camera has gone, the stage comes back (to Home) or lifts into place
   * (another capital)
   */
  afterDraw() {
    const load = this.load
    if (load && load.start === undefined) {
      load.start = performance.now()
      this.loop()
    }
    const run = this.run
    if (
      !run?.waitsForDraw ||
      run.phase !== "arriving" ||
      this.camera.state.request?.id === run.request
    ) {
      return
    }
    run.waitsForDraw = false
    if (run.kind === "switch") {
      run.lifted = performance.now()
      this.stageTo("lift", run.reduced)
      this.loop()
    } else {
      this.stageTo("rest", run.reduced)
    }
  }

  dispose() {
    cancelAnimationFrame(this.frame)
    this.sheet?.stop()
  }

  private transitionChanged() {
    const transition = this.input?.transition
    const reduced = prefersReducedMotion()
    if (!transition) {
      if (this.run) {
        this.run = undefined
        this.stageTo("rest", reduced)
        this.loop()
      }
      return
    }
    const current = this.run
    if (current?.id !== transition.id || current.phase !== transition.phase) {
      const next: Run = {
        id: transition.id,
        kind: transition.kind,
        phase: transition.phase,
        start: performance.now(),
        reduced,
        request: this.camera.state.request?.id,
      }
      this.run = next
      if (transition.phase === "leaving") {
        // Whatever is under way stops where it is: the whole map sinks
        this.stageTo("sink", reduced)
        this.loop()
        return
      }
      if (transition.kind === "open") {
        const capitals = this.lastHome ?? []
        next.chosen = capitals.find(({ slug }) => slug === transition.to)
        next.shares = next.chosen
          ? rippleShares(capitals, next.chosen.display)
          : new Map()
        next.homeZoom = this.camera.state.camera?.zoom
        this.stageTo("rest", reduced)
      } else {
        // Still sunk, until the new place is drawn
        this.stageTo("hidden", reduced)
        next.waitsForDraw = transition.kind === "back"
      }
    }
    // Another capital waits for the camera to be there
    const run = this.run
    if (
      run?.kind === "switch" &&
      run.phase === "arriving" &&
      run.lifted === undefined &&
      transition.ready
    ) {
      run.waitsForDraw = true
    }
    this.loop()
  }

  // The city shown with no transition to show it finishes loading as its
  // limits arrive: on its page opened directly
  private cityChanged() {
    const input = this.input
    const slug = input?.capital?.slug
    if (!input || !slug) {
      this.shownCity = undefined
      this.pending = false
      return
    }
    if (this.shownCity === slug) {
      return
    }
    if (input.transition?.to === slug) {
      // Its transition shows it
      this.shownCity = slug
      this.pending = false
      return
    }
    if (input.city === undefined) {
      this.pending = true
      this.loop()
      return
    }
    this.shownCity = slug
    this.pending = false
    if (input.city?.slug === slug && !input.onStreet) {
      this.load = { start: undefined, reduced: prefersReducedMotion() }
    }
    this.loop()
  }

  /** The stage: sinking, hidden, lifting into place, or at rest */
  private stageTo(to: "sink" | "hidden" | "lift" | "rest", reduced: boolean) {
    const element = this.input?.stage.current
    this.sheet?.stop()
    this.sheet = undefined
    if (!element) {
      return
    }
    const { sinkDrop, sinkShrink, cityRise } = motionDetails
    if (to === "sink") {
      this.sheet = reduced
        ? animate(
            element,
            { opacity: [1, 0] },
            toReducedFade(motionTokens.sink.duration)
          )
        : animate(
            element,
            {
              opacity: [1, 0],
              y: [0, sinkDrop],
              scale: [1, sinkShrink.city],
            },
            transitions.sink
          )
    } else if (to === "lift") {
      this.sheet = reduced
        ? animate(
            element,
            { opacity: [0, 1] },
            toReducedFade(motionTokens.lift.duration)
          )
        : animate(
            element,
            {
              opacity: [0, 1],
              y: [cityRise.drop, 0],
              scale: [cityRise.scale, 1],
            },
            transitions.lift
          )
    } else if (to === "hidden") {
      element.style.opacity = "0"
    } else {
      element.style.opacity = ""
      element.style.transform = ""
    }
  }

  private rest() {
    this.europe = 1
    this.leftBehind = undefined
    this.transit = undefined
    this.city = atRest()
    this.clock.phase = "off"
    this.clock.time = undefined
  }

  /** Draws each frame of what is under way, until it is over */
  private loop() {
    cancelAnimationFrame(this.frame)
    const step = (now: number) => {
      const active = this.tick(now)
      this.redraw()
      if (active) {
        this.frame = requestAnimationFrame(step)
      }
    }
    step(performance.now())
  }

  /** Each frame of what is under way, as it is at `now`; true while it goes on */
  private tick(now: number) {
    const input = this.input
    const run = this.run
    this.rest()
    if (!input) {
      return false
    }
    let active = false
    if (this.pending && !input.onStreet) {
      this.city.content = 0
      this.city.names = 0
    }
    // Leaving, the stage sinks on its own; another capital waits to lift
    const moving =
      run !== undefined &&
      !run.done &&
      run.phase === "arriving" &&
      (run.kind !== "switch" || run.lifted !== undefined)
    if (run && moving) {
      const finished =
        input.onStreet ||
        (run.kind === "open"
          ? this.openFrame(run, now)
          : run.kind === "back"
            ? this.backFrame(run, now)
            : this.switchFrame(run, now))
      if (finished) {
        run.done = true
        this.rest()
        input.onTransitionEnd?.(run.id)
      } else {
        active = true
      }
    }
    if (this.load) {
      if (input.onStreet || this.loadFrame(this.load, now)) {
        this.load = undefined
        this.city = atRest()
      } else if (this.load.start !== undefined) {
        // Until the map has drawn its parts once, the next frame drawn
        // starts it (`afterDraw`)
        active = true
      }
    }
    return active
  }

  /** Whether the capital's grid has drawn the area in view, or it has none */
  private gridReady() {
    const input = this.input
    return input?.gridDrawn === true || !input?.capital?.archives.grid
  }

  /**
   * Whether the camera has set out on a move asked for since the transition
   * started, and reached its end
   */
  private landed(run: Run) {
    const { camera } = this
    const shown = camera.state.camera
    const destination = camera.destination
    return (
      camera.state.request?.id !== run.request &&
      shown !== undefined &&
      destination !== undefined &&
      Math.abs(destination.zoom - shown.zoom) < 0.01 &&
      Math.abs(destination.longitude - shown.longitude) < 1e-5 &&
      Math.abs(destination.latitude - shown.latitude) < 1e-5
    )
  }

  /** Opening a capital from Home; true once it has arrived */
  private openFrame(run: Run, now: number) {
    const transition = this.input?.transition
    const opened = this.input?.capital
    const { reduced, chosen } = run
    const time = now - run.start
    const zoom = this.camera.state.camera?.zoom ?? 0
    const homeZoom = run.homeZoom ?? zoom
    const { sinkDrop, sinkRipple, sinkShrink, gridOpening, cityLoad } =
      motionDetails
    const { sink } = motionTokens

    // The others sink, rippling outwards; their names and lines fade
    const away = new Map<CapitalSlug, Away>()
    for (const [slug, share] of run.shares ?? []) {
      if (slug === chosen?.slug) {
        continue
      }
      const progress = reduced
        ? reducedFade(time)
        : eased(sink.curve, (time - share * sinkRipple) / sink.duration)
      away.set(slug, {
        drop: reduced ? 0 : sinkDrop * progress,
        shrink: reduced ? 1 : 1 - (1 - sinkShrink.capital) * progress,
        opacity: 1 - progress,
      })
    }
    const scale = chosen ? grownScale(chosen.scale, homeZoom, zoom) : 1
    const fades = reduced ? motionDetails.reducedFade : undefined
    // The real city takes the outline's place once it has its true size
    if (
      run.handOver === undefined &&
      transition?.ready &&
      (scale <= 1.0001 || this.landed(run))
    ) {
      run.handOver = now
    }
    const handOver = run.handOver === undefined ? undefined : now - run.handOver
    const gone = handOver === undefined ? 0 : fade(handOver, fades)
    this.leftBehind = this.lastHome
    this.europe = 1 - gone
    this.transit = {
      away,
      grown: chosen && {
        slug: chosen.slug,
        scale,
        origin: grownOrigin(chosen, scale),
        opacity: 1 - gone,
      },
      extras: 1 - fade(time, fades),
    }
    const city = this.city
    if (handOver === undefined) {
      Object.assign(city, waiting)
      return false
    }
    const shows = reduced ? reducedFade(handOver) : 1
    city.ground = shows
    city.limits = shows
    city.shadow = shows
    city.rings = reduced ? shows : fade(handOver - cityLoad.rings)
    // Once the camera has landed and the grid has drawn the area in view,
    // the grid opens from the centre
    if (run.opened === undefined && this.landed(run) && this.gridReady()) {
      run.opened = now
    }
    if (run.opened === undefined) {
      city.content = 0
      city.names = 0
      return false
    }
    const open = now - run.opened
    if (reduced) {
      city.content = reducedFade(open)
      city.names = city.content
      return open >= motionDetails.reducedFade && gone >= 1
    }
    const view = this.camera.state.camera
    if (opened && view) {
      const { size } = this.camera.state
      const [west, south, east, north] = opened.bbox
      const [x, y] = viewportOf(view, size).project([
        (west + east) / 2,
        (south + north) / 2,
      ])
      const farthest = Math.max(
        ...[
          [0, 0],
          [size.width, 0],
          [0, size.height],
          [size.width, size.height],
        ].map(([cornerX, cornerY]) => Math.hypot(cornerX - x, cornerY - y))
      )
      const clock = this.clock
      clock.phase = "running"
      clock.origin = [x, y]
      clock.time =
        eased(motionTokens.draw.curve, open / gridOpening) *
        ((opening.rings - 1) * opening.apart + opening.fade)
      city.opening = {
        revealClock: clock,
        revealSpacing: Math.max(1, farthest / opening.rings),
        revealWaves: opening.rings,
        revealWaveDelay: opening.apart,
        revealDuration: opening.fade,
        revealDirection: 1,
      }
    }
    city.names = fade(open - gridOpening)
    return open >= gridOpening + motionTokens.fade.duration && gone >= 1
  }

  /** Back on Home; true once the capitals are back in place */
  private backFrame(run: Run, now: number) {
    const capitals = this.input?.home
    const { camera } = this
    const { reduced } = run
    const time = now - run.start
    // Where the camera lands, read once it has set out
    if (
      run.homeZoom === undefined &&
      camera.state.request?.id !== run.request
    ) {
      run.homeZoom = camera.destination?.zoom
    }
    const zoom = camera.state.camera?.zoom ?? 0
    const homeZoom = run.homeZoom ?? zoom
    const { sinkDrop, sinkRipple, sinkShrink, riseDelay } = motionDetails
    const from = this.input?.transition?.from
    if (capitals && !run.shares) {
      run.chosen = capitals.find(({ slug }) => slug === from)
      run.shares = run.chosen
        ? rippleShares(capitals, run.chosen.display)
        : new Map(capitals.map(({ slug }) => [slug, 0]))
    }
    const left = run.chosen
    const away = new Map<CapitalSlug, Away>()
    for (const [slug, share] of run.shares ?? []) {
      if (slug === left?.slug) {
        continue
      }
      const progress = reduced
        ? reducedFade(time)
        : springAt(motionTokens.lift, time - riseDelay - share * sinkRipple)
      away.set(slug, {
        drop: reduced ? 0 : sinkDrop * (1 - progress),
        shrink: reduced
          ? 1
          : sinkShrink.capital + (1 - sinkShrink.capital) * progress,
        opacity: Math.min(1, Math.max(0, progress)),
      })
    }
    const fades = reduced ? motionDetails.reducedFade : undefined
    const scale = left ? grownScale(left.scale, homeZoom, zoom) : 1
    this.europe = fade(time, fades)
    this.transit = {
      away,
      grown: left && {
        slug: left.slug,
        scale,
        origin: grownOrigin(left, scale),
        opacity: run.homeZoom === undefined ? 0 : fade(time, fades),
      },
      extras: reduced ? reducedFade(time) : fade(time - riseDelay - sinkRipple),
    }
    const rises = reduced
      ? motionDetails.reducedFade
      : riseDelay + sinkRipple + motionTokens.lift.duration
    return time >= rises && this.landed(run)
  }

  /** Opening a capital from another; true once it has lifted into place */
  private switchFrame(run: Run, now: number) {
    const time = now - (run.lifted ?? now)
    if (run.reduced) {
      return time >= motionDetails.reducedFade
    }
    const out = springAt(motionTokens.lift, time)
    this.city.shadowOut = out
    this.city.shadow = 0.4 + 0.6 * Math.min(1, out)
    this.city.rings = fade(time - ringsAfterLift)
    return (
      time >= motionTokens.lift.duration &&
      time >= ringsAfterLift + motionTokens.fade.duration
    )
  }

  /** A city finishing loading; true once it has */
  private loadFrame(load: Load, now: number) {
    const city = this.city
    if (load.start === undefined) {
      Object.assign(city, waiting, { drawn: 0 })
      return false
    }
    const time = now - load.start
    if (load.reduced) {
      // The rest of the city fades in once the grid is drawn, so it never
      // appears at once
      if (load.content === undefined && this.gridReady()) {
        load.content = now
      }
      const shows = reducedFade(time)
      const content =
        load.content === undefined ? 0 : reducedFade(now - load.content)
      Object.assign(city, {
        ground: shows,
        limits: shows,
        shadow: shows,
        rings: shows,
        content,
        names: content,
      })
      return (
        time >= motionDetails.reducedFade &&
        load.content !== undefined &&
        now - load.content >= motionDetails.reducedFade
      )
    }
    const { cityLoad } = motionDetails
    if (
      load.content === undefined &&
      time >= cityLoad.content &&
      this.gridReady()
    ) {
      load.content = now
    }
    city.drawn = eased(motionTokens.draw.curve, time / cityLoad.draw)
    city.rings = fade(time - cityLoad.rings)
    city.ground = fade(time - cityLoad.ground)
    city.shadow = fade(time - cityLoad.shadow)
    const popped =
      load.content === undefined
        ? 0
        : springAt(motionTokens.pop, now - load.content)
    city.content = Math.min(1, Math.max(0, popped))
    city.names = city.content
    return (
      load.content !== undefined &&
      now - load.content >= motionTokens.pop.duration &&
      time >= cityLoad.draw &&
      time >= cityLoad.shadow + motionTokens.fade.duration
    )
  }
}

/**
 * The map's transitions between places, told what the map draws after
 * each render
 */
export function useViewMotion(
  camera: MapCamera,
  redraw: () => void,
  input: ViewInput
) {
  const [motion] = useState(() => new ViewMotion(camera, redraw))
  useLayoutEffect(() => {
    motion.update(input)
  })
  useEffect(() => () => motion.dispose(), [motion])
  return motion
}
