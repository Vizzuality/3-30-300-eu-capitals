/*
 * The map's scale bar: a round distance (1, 2 or 5 × 10ⁿ metres) and the
 * width it takes on screen. It picks the longest round distance that fits
 * within the bar's widest width, so the bar is never shorter than 40% of
 * that width (from 5 down to 2) and grows and shrinks as the map zooms.
 * Distances of 1 km or more are written in kilometres.
 */

/** The widest the bar may be, in CSS pixels (as in the reference design) */
export const scaleBarMaxWidth = 168

export type ScaleBar = {
  /** The distance in metres */
  metres: number
  /** The distance as written, in its unit */
  value: number
  unit: "meter" | "kilometer"
  /** The bar's width, in CSS pixels */
  width: number
}

const steps = [5, 2, 1] as const

/**
 * The scale bar for a map showing `metresPerPixel` metres in each CSS
 * pixel, or undefined when that is not a usable scale
 */
export function scaleBar(
  metresPerPixel: number,
  maxWidth = scaleBarMaxWidth
): ScaleBar | undefined {
  if (
    !Number.isFinite(metresPerPixel) ||
    metresPerPixel <= 0 ||
    !(maxWidth > 0)
  ) {
    return undefined
  }

  // A hair longer, so a distance that fills the bar exactly is not lost to
  // a floating-point error
  const longest = metresPerPixel * maxWidth * (1 + 1e-9)
  let power = Math.floor(Math.log10(longest))
  // Logarithms of exact powers of ten can land just below the integer
  if (10 ** (power + 1) <= longest) {
    power += 1
  }
  const base = 10 ** power
  const step = steps.find((item) => item * base <= longest) ?? 1
  // Rounded, so 0.1 × 2 reads 0.2 rather than 0.20000000000000001
  const metres = Number((step * base).toPrecision(1))

  return {
    metres,
    value: metres >= 1000 ? metres / 1000 : metres,
    unit: metres >= 1000 ? "kilometer" : "meter",
    width: Math.round(metres / metresPerPixel),
  }
}
