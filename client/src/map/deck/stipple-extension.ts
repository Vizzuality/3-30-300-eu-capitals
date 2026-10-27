import { LayerExtension, type Layer } from "@deck.gl/core"

import type { Rgba } from "@/map/map-colors"

/*
 * The parks' stipple: dots on the ground, fixed to it as the map moves, and
 * lined up across tiles. deck.gl's `FillStyleExtension` draws procedural
 * patterns from the layer's origin in 32-bit floats; at street level the
 * origin is the centre of the view (deck.gl's offset mode, from zoom 12),
 * hundreds of common units against dots a ten-thousandth of one apart, so
 * the dots jump at each frame of a pan. Hence this small extension of our
 * own, for the tiles: each tile gives where its corner falls in the pattern
 * (worked out in 64-bit floats, a few metres at most), and each vertex its
 * place in the tile, so the shader only handles small numbers.
 *
 * The pattern is a square lattice of dots turned 45° (two dots per square
 * cell: one at its corners, one at its centre).
 */

export type StippleProps = {
  /** Where the tile's top left corner falls in the pattern, in metres */
  stippleOrigin?: readonly [number, number]
  /** Metres on the ground in one unit of the tile's own coordinates */
  stippleScale?: number
  /** The square cell, in metres: dots at its corners and its centre */
  stippleCell?: number
  /** The dots' radius, in metres */
  stippleRadius?: number
  /** The dots' colour, drawn over the layer's fill */
  stippleColor?: Rgba
}

const stippleModule = {
  name: "stipple",
  vs: /* glsl */ `
layout(std140) uniform stippleUniforms {
  vec2 origin;
  float scale;
  float cell;
  float radius;
  vec4 color;
} stipple;
`,
  fs: /* glsl */ `
layout(std140) uniform stippleUniforms {
  vec2 origin;
  float scale;
  float cell;
  float radius;
  vec4 color;
} stipple;
`,
  uniformTypes: {
    origin: "vec2<f32>",
    scale: "f32",
    cell: "f32",
    radius: "f32",
    color: "vec4<f32>",
  },
} as const

export class StippleExtension extends LayerExtension {
  static defaultProps = {
    stippleOrigin: [0, 0],
    stippleScale: 1,
    stippleCell: 6,
    stippleRadius: 0.7,
    stippleColor: [0, 0, 0, 255],
  }
  static extensionName = "StippleExtension"

  getShaders() {
    return {
      modules: [stippleModule],
      inject: {
        "vs:#decl": "out vec2 stipple_position;",
        // The vertex in the tile's own coordinates (0 to 1, y down)
        "vs:DECKGL_FILTER_GL_POSITION": /* glsl */ `
  stipple_position = stipple.origin + geometry.worldPosition.xy * stipple.scale;
`,
        "fs:#decl": "in vec2 stipple_position;",
        "fs:DECKGL_FILTER_COLOR": /* glsl */ `
  {
    vec2 inCell = mod(stipple_position, stipple.cell);
    float toCorner = length(min(inCell, stipple.cell - inCell));
    float toCentre = length(inCell - 0.5 * stipple.cell);
    float toDot = min(toCorner, toCentre) - stipple.radius;
    // Smoothed over a pixel
    float width = max(fwidth(toDot), 1e-6);
    float onDot = 1.0 - smoothstep(-0.5 * width, 0.5 * width, toDot);
    color.rgb = mix(color.rgb, stipple.color.rgb, onDot * stipple.color.a);
  }
`,
      },
    }
  }

  draw(this: Layer<StippleProps>) {
    const props = this.props
    const color = props.stippleColor ?? [0, 0, 0, 255]
    this.setShaderModuleProps({
      stipple: {
        origin: props.stippleOrigin ?? [0, 0],
        scale: props.stippleScale ?? 1,
        cell: props.stippleCell ?? 6,
        radius: props.stippleRadius ?? 0.7,
        color: color.map((channel) => channel / 255),
      },
    })
  }
}
