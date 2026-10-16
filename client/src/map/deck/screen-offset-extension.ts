import { LayerExtension, type Layer } from "@deck.gl/core"

/*
 * Shifts a layer by a few pixels on screen, whatever the zoom: the soft
 * shadow under each capital, and the lift of the one under the pointer or in
 * focus. deck.gl offsets in pixels only for text and icons
 * (`getPixelOffset`); a polygon's `modelMatrix` moves it in metres, which
 * would have to be worked out again on every frame of a camera move. The
 * offset is a uniform, so animating a lift changes no attribute.
 *
 * The shift is left out of picking: what the pointer hits stays where the
 * thing rests, so a lifted capital never slides out from under a still
 * pointer and drops back, over and over.
 */

export type ScreenOffsetProps = {
  /** In CSS pixels, x to the right, y down */
  screenOffset?: readonly [number, number]
}

const screenOffsetModule = {
  name: "screenOffset",
  vs: /* glsl */ `
layout(std140) uniform screenOffsetUniforms {
  vec2 offset;
} screenOffset;
`,
  uniformTypes: { offset: "vec2<f32>" },
} as const

export class ScreenOffsetExtension extends LayerExtension {
  static defaultProps = { screenOffset: [0, 0] }
  static extensionName = "ScreenOffsetExtension"

  getShaders() {
    return {
      modules: [screenOffsetModule],
      inject: {
        // From CSS pixels to clip space, after the projection
        "vs:DECKGL_FILTER_GL_POSITION": /* glsl */ `
  if (picking.isActive < 0.5) {
    position.xy += screenOffset.offset * vec2(2.0, -2.0)
      / project.viewportSize * project.devicePixelRatio * position.w;
  }
`,
      },
    }
  }

  draw(this: Layer<ScreenOffsetProps>) {
    this.setShaderModuleProps({
      screenOffset: { offset: this.props.screenOffset ?? [0, 0] },
    })
  }
}

/** One instance for every layer that uses it */
export const screenOffset = new ScreenOffsetExtension()
