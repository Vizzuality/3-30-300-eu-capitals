import { LayerExtension, type Layer } from "@deck.gl/core"

import { motionTokens } from "@/design/tokens"
import { dampingRatio, naturalFrequency } from "@/design/tokens-motion"

/*
 * The arrival at street level, on the GPU: thousands of buildings and trees
 * pop in, in waves spreading from where the visitor clicked, while the grid
 * of the city overview gives way in rings around the same point. deck.gl
 * has no such animation (its transitions animate a whole layer's attribute
 * from one value to another, the same for every feature), and recreating the
 * layers on each frame drops frames on a slow phone, hence this small
 * extension of our own.
 *
 * Every feature works out its own delay from its distance to the click, on
 * screen, then its scale about its centre (the Pop spring, as the motion
 * tokens define it) and its opacity. The same centre holds a selected
 * building's wobble (Squash), a shape on screen changed in place. The animation's state is a shared
 * clock, read each time the layer is drawn: animating only asks deck.gl to
 * draw again, and no layer is recreated. Three kinds of layers:
 * - `features`: polygons scaled about a centre given per feature (a
 *   building's representative point), in the layer's own coordinates;
 * - `points`: circles scaled about their own position (trees);
 * - `area`: a whole layer (the grid, the overview's water, the street's
 *   ground) shown or hidden pixel by pixel, in rings spreading from the
 *   click.
 */

export type RevealKind = "features" | "points" | "area"

/** The state of the arrival, shared by every layer that takes part in it */
export type RevealClock = {
  /**
   * Off: everything as it rests (no effect); armed: waiting for the street's
   * tiles, everything still as before the arrival; running since `start`
   */
  phase: "off" | "armed" | "running"
  /** In `performance.now()` milliseconds */
  start: number
  /** Where the waves start, in CSS pixels from the map's top left corner */
  origin: [number, number]
  /** Under reduced motion, everything fades at once instead */
  reduced: boolean
}

export const makeRevealClock = (): RevealClock => ({
  phase: "off",
  start: 0,
  origin: [0, 0],
  reduced: false,
})

/** The overview's props over the street: its opacity, and its rings */
export type OverviewStyle = Record<string, unknown> & {
  opacity: number
  visible: boolean
  extensions: Array<LayerExtension>
}

export type RevealProps<Data = unknown> = {
  revealClock?: RevealClock
  /** A feature's centre, in the layer's own coordinates (`features` only) */
  getRevealCentre?: (feature: Data) => [number, number, number]
  /** How far apart the waves or rings are, in CSS pixels */
  revealSpacing?: number
  /** The most waves or rings: farther features join the last one */
  revealWaves?: number
  /** The time between two waves or rings, in milliseconds */
  revealWaveDelay?: number
  /** When this layer starts, after the arrival starts, in milliseconds */
  revealDelay?: number
  /** How long a ring takes to fade, and the fade under reduced motion */
  revealDuration?: number
  /** `area` only: 1 appears, −1 gives way */
  revealDirection?: number
  /**
   * `features` only: a wobble's shape on screen, about each feature's centre
   * (1, 1 at rest); changed in place, read as the layer is drawn
   */
  revealSquash?: readonly [number, number]
}

// The Pop spring, as its token defines it (a duration and an overshoot)
const popRatio = dampingRatio(motionTokens.pop.overshoot)
const popFrequency = naturalFrequency(motionTokens.pop.duration, popRatio)

const uniformBlock = /* glsl */ `
layout(std140) uniform revealUniforms {
  vec2 origin;
  float enabled;
  float time;
  float reduced;
  float spacing;
  float waves;
  float waveDelay;
  float delay;
  float duration;
  float direction;
  float ratio;
  float frequency;
  vec2 squash;
} reveal;
`

const revealModule = {
  name: "reveal",
  vs: uniformBlock,
  fs: uniformBlock,
  uniformTypes: {
    origin: "vec2<f32>",
    enabled: "f32",
    time: "f32",
    reduced: "f32",
    spacing: "f32",
    waves: "f32",
    waveDelay: "f32",
    delay: "f32",
    duration: "f32",
    direction: "f32",
    ratio: "f32",
    frequency: "f32",
    squash: "vec2<f32>",
  },
} as const

/** A damped spring's progress from 0 to 1, `time` in milliseconds */
const springFunction = /* glsl */ `
float reveal_spring(float time) {
  if (time <= 0.0) {
    return 0.0;
  }
  float seconds = time / 1000.0;
  float damped = reveal.frequency * sqrt(1.0 - reveal.ratio * reveal.ratio);
  float decay = exp(-reveal.ratio * reveal.frequency * seconds);
  return 1.0 - decay * (cos(damped * seconds)
    + reveal.ratio * reveal.frequency / damped * sin(damped * seconds));
}

vec2 reveal_pixels(vec4 clip) {
  return (clip.xy / clip.w * vec2(0.5, -0.5) + 0.5)
    * project.viewportSize / project.devicePixelRatio;
}

float reveal_wave(vec2 pixels) {
  return min(reveal.waves - 1.0,
    floor(length(pixels - reveal.origin) / reveal.spacing));
}
`

/** Scales the vertex about the centre, and passes the opacity on */
const popVertex = (centre: string) => /* glsl */ `
  reveal_alpha = 1.0;
  if (reveal.enabled > 0.5) {
    if (reveal.reduced > 0.5) {
      reveal_alpha = clamp((reveal.time - reveal.delay) / reveal.duration, 0.0, 1.0);
    } else {
      vec4 centreClip = project_position_to_clipspace(${centre}, vec3(0.0), vec3(0.0));
      float local = reveal.time - reveal.delay
        - reveal_wave(reveal_pixels(centreClip)) * reveal.waveDelay;
      float scale = reveal_spring(local);
      vec2 centreNdc = centreClip.xy / centreClip.w;
      vec2 vertexNdc = position.xy / position.w;
      position.xy = (centreNdc + (vertexNdc - centreNdc) * scale) * position.w;
      // A quick fade as it starts, so it never appears as a dot
      reveal_alpha = clamp(local / 90.0, 0.0, 1.0);
    }
  }
  if (reveal.squash != vec2(1.0)) {
    vec4 squashClip = project_position_to_clipspace(${centre}, vec3(0.0), vec3(0.0));
    vec2 squashNdc = squashClip.xy / squashClip.w;
    vec2 vertexNdc = position.xy / position.w;
    position.xy = (squashNdc + (vertexNdc - squashNdc) * reveal.squash) * position.w;
  }
`

export class RevealExtension extends LayerExtension<{ kind: RevealKind }> {
  static defaultProps = {
    revealClock: { type: "object", value: makeRevealClock(), compare: false },
    getRevealCentre: { type: "accessor", value: [0, 0, 0] },
    revealSpacing: 120,
    revealWaves: 3,
    revealWaveDelay: 120,
    revealDelay: 0,
    revealDuration: 280,
    revealDirection: 1,
    revealSquash: { type: "array", value: [1, 1], compare: false },
  }
  static extensionName = "RevealExtension"

  constructor(kind: RevealKind) {
    super({ kind })
  }

  getShaders(this: Layer, extension: this) {
    const { kind } = extension.opts
    if (kind === "area") {
      return {
        modules: [revealModule],
        inject: {
          "vs:#decl": "out vec2 reveal_pixel;",
          "vs:DECKGL_FILTER_GL_POSITION": /* glsl */ `
  reveal_pixel = (position.xy / position.w * vec2(0.5, -0.5) + 0.5)
    * project.viewportSize / project.devicePixelRatio;
`,
          "fs:#decl": "in vec2 reveal_pixel;",
          "fs:DECKGL_FILTER_COLOR": /* glsl */ `
  if (reveal.enabled > 0.5) {
    float ring = min(reveal.waves - 1.0,
      floor(length(reveal_pixel - reveal.origin) / reveal.spacing));
    float shown = reveal.reduced > 0.5
      ? clamp((reveal.time - reveal.delay) / reveal.duration, 0.0, 1.0)
      : smoothstep(0.0, 1.0, clamp(
          (reveal.time - reveal.delay - ring * reveal.waveDelay) / reveal.duration,
          0.0, 1.0));
    color.a *= reveal.direction > 0.0 ? shown : 1.0 - shown;
    if (color.a < 0.002) {
      discard;
    }
  }
`,
        },
      }
    }
    return {
      modules: [revealModule],
      inject: {
        "vs:#decl": /* glsl */ `
${kind === "features" ? "in vec3 revealCentres;" : ""}
out float reveal_alpha;
${springFunction}
`,
        "vs:DECKGL_FILTER_GL_POSITION": popVertex(
          kind === "features" ? "revealCentres" : "geometry.worldPosition"
        ),
        "fs:#decl": "in float reveal_alpha;",
        "fs:DECKGL_FILTER_COLOR": /* glsl */ `
  color.a *= reveal_alpha;
  if (color.a < 0.002) {
    discard;
  }
`,
      },
    }
  }

  initializeState(this: Layer, _context: unknown, extension: this) {
    if (extension.opts.kind === "features") {
      this.getAttributeManager()?.add({
        revealCentres: {
          size: 3,
          stepMode: "dynamic",
          accessor: "getRevealCentre",
        },
      })
    }
  }

  draw(this: Layer<RevealProps>) {
    const props = this.props
    const clock =
      props.revealClock ?? RevealExtension.defaultProps.revealClock.value
    const time =
      clock.phase === "running"
        ? performance.now() - clock.start
        : // Armed: before anything has started
          -1e6
    this.setShaderModuleProps({
      reveal: {
        origin: clock.origin,
        enabled: clock.phase === "off" ? 0 : 1,
        time,
        reduced: clock.reduced ? 1 : 0,
        spacing: Math.max(1, props.revealSpacing ?? 120),
        waves: props.revealWaves ?? 3,
        waveDelay: props.revealWaveDelay ?? 120,
        delay: props.revealDelay ?? 0,
        duration: Math.max(1, props.revealDuration ?? 280),
        direction: props.revealDirection ?? 1,
        ratio: popRatio,
        frequency: popFrequency,
        squash: props.revealSquash ?? [1, 1],
      },
    })
  }
}
