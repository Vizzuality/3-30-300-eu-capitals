/*
 * Where the Home map's label goes for the capital it labels: centred 12 px
 * above it, as long as it fits. Near the top of the map, where it would leave
 * the map, it goes 12 px below the capital instead (below its lowest point,
 * `bottom`, for a capital drawn as a shape); near the left or right edge it
 * slides sideways to stay inside. It keeps 8 px from every edge of the map, unless
 * the map is too small for that, and then it keeps to its top left corner.
 */

/** From the label to the point it labels, in pixels */
export const labelGap = 12

/** The least space between the label and the map's edges, in pixels */
export const labelMargin = 8

type Size = { width: number; height: number }

export type LabelPlacement = {
  /** The label's top left corner, in pixels from the map's top left corner */
  left: number
  top: number
  /** Whether it sits below the point, rather than above */
  below: boolean
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max))

/**
 * The label's place on a map of size `map`, for a point (`x`, `y`), or a
 * shape whose top middle is (`x`, `y`) and whose lowest point is at `bottom`
 */
export function labelPlacement(
  point: { x: number; y: number; bottom?: number },
  label: Size,
  map: Size
): LabelPlacement {
  const above = point.y - labelGap - label.height
  const under = (point.bottom ?? point.y) + labelGap
  const fitsAbove = above >= labelMargin
  const fitsUnder = under + label.height <= map.height - labelMargin
  // Above when it fits; otherwise wherever there is more room
  const below =
    !fitsAbove &&
    (fitsUnder || map.height - (point.bottom ?? point.y) > point.y)

  const maxLeft = Math.max(labelMargin, map.width - labelMargin - label.width)
  const maxTop = Math.max(labelMargin, map.height - labelMargin - label.height)

  return {
    left: clamp(point.x - label.width / 2, labelMargin, maxLeft),
    top: clamp(below ? under : above, labelMargin, maxTop),
    below,
  }
}
