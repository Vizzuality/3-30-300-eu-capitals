import type { Capital } from "@/data/schemas"

/** The size of the box an outline is drawn in, in SVG units */
const BOX = 100

// One decimal is a tenth of a percent of the box, far finer than a pixel
const round = (value: number) => Math.round(value * 10) / 10

/** An outline as an SVG path, with the view box that fits it */
export type OutlinePath = { d: string; viewBox: string }

/**
 * A capital's outline, the same shape as on the map, as an SVG path fitted to
 * a 100-unit box: its longest side fills the box, the other keeps the shape's
 * proportions. The release gives each ring in metres from the capital's
 * centre, y north; SVG's y runs down, so the shape is flipped. Rings are
 * drawn as sub-paths, holes included, to be filled with the even-odd rule.
 */
export function outlinePath(outline: Capital["outline"]): OutlinePath {
  const points = outline.flat(2)
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const west = Math.min(...xs)
  const north = Math.max(...ys)
  const width = Math.max(...xs) - west
  const height = north - Math.min(...ys)
  const scale = BOX / Math.max(width, height, Number.EPSILON)

  const d = outline
    .flat()
    .map((ring) =>
      ring
        // Rings are closed: the last point repeats the first
        .slice(0, -1)
        .map(([x, y], index) => {
          const command = index === 0 ? "M" : "L"
          return `${command}${round((x - west) * scale)} ${round((north - y) * scale)}`
        })
        .join("")
        .concat("Z")
    )
    .join("")

  return {
    d,
    viewBox: `0 0 ${round(width * scale)} ${round(height * scale)}`,
  }
}
