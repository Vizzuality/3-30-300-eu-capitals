import { LayerExtension, type Layer } from "@deck.gl/core"

/*
 * Picks buildings out of a layer by their id: the street's buildings leave
 * out those drawn lifted (the one under the pointer, the one in keyboard
 * focus, and those settling back), and each lifted copy shows only its own
 * building, from the same tiles.
 *
 * deck.gl's `DataFilterExtension` keeps the features inside a range: it can
 * show the copy's one building, but cannot leave out one value from the
 * others short of recomputing an attribute on every hover or drawing the
 * layer twice. Hence this small extension of our own, used both ways: each
 * feature's id is an attribute, the ids four uniforms, read from a shared
 * object as the layer is drawn, so a new hovered building only asks deck.gl
 * to draw again. One extension for both also keeps the copies on the same
 * shader programs as the buildings: a first hover compiles nothing.
 *
 * The buildings left out are still picked, so the pointer keeps the
 * building it rests on, whose lifted copy is drawn where it rests too.
 */

/** Up to four ids, −1 for none; shared, read each time the layer is drawn */
export type HiddenIds = { ids: [number, number, number, number] }

export const makeHiddenIds = (): HiddenIds => ({ ids: [-1, -1, -1, -1] })

export type HideProps<Data = unknown> = {
  hiddenIds?: HiddenIds
  /** Shows only the buildings listed, instead of leaving them out */
  hideOthers?: boolean
  /** A feature's id */
  getHideId?: (feature: Data) => number
}

const hideModule = {
  name: "hide",
  vs: /* glsl */ `
layout(std140) uniform hideUniforms {
  vec4 ids;
  float others;
} hide;
`,
  uniformTypes: { ids: "vec4<f32>", others: "f32" },
} as const

export class HideExtension extends LayerExtension {
  static defaultProps = {
    hiddenIds: { type: "object", value: makeHiddenIds(), compare: false },
    hideOthers: false,
    getHideId: { type: "accessor", value: -1 },
  }
  static extensionName = "HideExtension"

  getShaders() {
    return {
      modules: [hideModule],
      inject: {
        "vs:#decl": /* glsl */ `
in float hideIds;
out float hide_hidden;
`,
        "vs:DECKGL_FILTER_GL_POSITION": /* glsl */ `
  vec4 hideDistance = abs(vec4(hideIds) - hide.ids);
  bool hideListed = min(min(hideDistance.x, hideDistance.y),
    min(hideDistance.z, hideDistance.w)) < 0.5;
  hide_hidden = picking.isActive < 0.5
    && (hide.others > 0.5 ? !hideListed : hideListed) ? 1.0 : 0.0;
  // Out of the screen: what is left out costs no pixel at all
  if (hide_hidden > 0.5) {
    position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`,
        "fs:#decl": "in float hide_hidden;",
        "fs:DECKGL_FILTER_COLOR": /* glsl */ `
  if (hide_hidden > 0.5) {
    discard;
  }
`,
      },
    }
  }

  initializeState(this: Layer) {
    this.getAttributeManager()?.add({
      hideIds: { size: 1, stepMode: "dynamic", accessor: "getHideId" },
    })
  }

  draw(this: Layer<HideProps>) {
    const hidden =
      this.props.hiddenIds ?? HideExtension.defaultProps.hiddenIds.value
    this.setShaderModuleProps({
      hide: { ids: hidden.ids, others: this.props.hideOthers ? 1 : 0 },
    })
  }
}
