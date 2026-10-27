import { TextLayer } from "@deck.gl/layers"
import { useCallback, useEffect, useRef, useState } from "react"

import { fonts, typeScale } from "@/design/tokens"
import { prefersReducedMotion } from "@/design/reduced-motion"
import { placePlaceNames, type PlaceLabel } from "@/lib/place-name-placement"
import { viewportOf } from "@/map/camera"
import type { MapCamera } from "@/map/map-camera"
import type { MapColors } from "@/map/map-colors"
import { nameFontFamily, nameTextSettings } from "./capital-layers"
import type { ContextTileContent } from "./context-tile-decode"
import { mapObstacles } from "./street-names"

/*
 * The district names on the city overview, to find one's way: the
 * candidates of the context tiles in view, placed by collision only
 * (`placePlaceNames`), again as the camera moves, at most every 300 ms, and
 * fading in and out as they come and go, as MapLibre does (at once under
 * reduced motion). In Ink, the capitals' names' style, with a halo in the
 * Surface colour. At street level the street names take over, and these
 * are hidden.
 *
 * Names are written as they are on the map, in the local language (Greek
 * in Nicosia, Cyrillic in Sofia, French and Dutch in Brussels). The font:
 * Figtree, and for Greek and Cyrillic, Noto Sans, both bundled with the
 * site; the names' characters are loaded before they join the atlas
 * deck.gl draws them from, which is made again only when a name brings a
 * new character.
 */

/** The least room between a name and anything else, in pixels */
const namePadding = 16
/** The halo, on each side, in pixels */
const halo = 1.5
/** How often names are placed again while the camera moves */
const placementInterval = 300
/** Their fade in and out, in milliseconds */
const fadeDuration = 300

type Shown = { label: PlaceLabel; opacity: number; target: number }

const { size: textSize, weight: textWeight } = typeScale.mapName
const canvasFont = `${textWeight} ${textSize}px ${fonts.sans
  .slice(0, 2)
  .map((family) => `"${family}"`)
  .join(", ")}`

// Text widths as deck.gl lays them out: each character's advance, no kerning
const widths = new Map<string, number>()
let measure: CanvasRenderingContext2D | null | undefined
function textWidth(text: string) {
  let width = widths.get(text)
  if (width === undefined) {
    measure ??= document.createElement("canvas").getContext("2d")
    if (!measure) {
      return text.length * textSize * 0.6
    }
    measure.font = canvasFont
    width = 0
    for (const character of text) {
      width += measure.measureText(character).width
    }
    widths.set(text, width)
  }
  return width
}

export function usePlaceNames({
  camera,
  root,
  shown: enabled,
  redraw,
}: {
  camera: MapCamera
  /** The map's element, whose overlays the names keep clear of */
  root: () => HTMLElement | null
  /** Whether names may show: on the city overview */
  shown: boolean
  redraw: () => void
}) {
  const candidates = useRef<Array<PlaceLabel>>([])
  const shown = useRef(new Map<string, Shown>())
  const version = useRef(0)
  const enabledRef = useRef(enabled)
  const [characterSet, setCharacterSet] = useState("")
  const characterSetRef = useRef("")

  const fading = useRef(false)
  const lastFrame = useRef(0)
  const startFade = useCallback(() => {
    if (fading.current) {
      return
    }
    fading.current = true
    lastFrame.current = performance.now()
    const frame = (now: number) => {
      const step = prefersReducedMotion()
        ? 1
        : (now - lastFrame.current) / fadeDuration
      lastFrame.current = now
      let moving = false
      for (const [key, entry] of shown.current) {
        entry.opacity =
          entry.opacity < entry.target
            ? Math.min(entry.target, entry.opacity + step)
            : Math.max(entry.target, entry.opacity - step)
        if (entry.opacity !== entry.target) {
          moving = true
        } else if (entry.target === 0) {
          shown.current.delete(key)
        }
      }
      version.current += 1
      redraw()
      if (moving) {
        requestAnimationFrame(frame)
      } else {
        fading.current = false
      }
    }
    requestAnimationFrame(frame)
  }, [redraw])

  const place = useCallback(() => {
    const { camera: view, size } = camera.state
    const entries = shown.current
    const known = characterSetRef.current
    let placed: Array<PlaceLabel> = []
    const counts = { candidates: 0, outside: 0, overlay: 0, name: 0 }
    if (view && enabledRef.current && known) {
      const viewport = viewportOf(view, size)
      placed = placePlaceNames(
        // Only names whose characters the font has loaded
        candidates.current.filter(({ text }) =>
          [...text].every(
            (character) => character === " " || known.includes(character)
          )
        ),
        {
          project: (longitude, latitude) => {
            const [x, y] = viewport.project([longitude, latitude])
            return [x, y]
          },
          size,
          height: textSize + 2 * halo,
          padding: namePadding,
          obstacles: mapObstacles(root(), 0),
        },
        counts
      ).map(({ label }) => label)
    }
    // The names written and where, for the tests to follow
    const element = root()
    if (element) {
      element.dataset.placeCounts = JSON.stringify(counts)
      const { camera: shownCamera, size: mapSize } = camera.state
      const viewport = shownCamera && viewportOf(shownCamera, mapSize)
      element.dataset.placeNames = JSON.stringify(
        viewport
          ? placed.map(({ text, longitude, latitude }) => {
              const [x, y] = viewport.project([longitude, latitude])
              return [text, Math.round(x * 10) / 10, Math.round(y * 10) / 10]
            })
          : []
      )
    }
    const kept = new Set(placed.map(({ key }) => key))
    let changed = false
    for (const label of placed) {
      const entry = entries.get(label.key)
      if (!entry) {
        entries.set(label.key, { label, opacity: 0, target: 1 })
        changed = true
      } else if (entry.target !== 1) {
        entry.target = 1
        changed = true
      }
    }
    for (const entry of entries.values()) {
      if (!kept.has(entry.label.key) && entry.target !== 0) {
        entry.target = 0
        changed = true
      }
    }
    if (changed) {
      startFade()
    }
  }, [camera, root, startFade])

  // When the camera moves, at most every 300 ms, and when it stops
  useEffect(() => {
    let last = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let previous = camera.state.camera
    const unsubscribe = camera.subscribe(() => {
      const next = camera.state.camera
      if (next === previous) {
        return
      }
      previous = next
      const now = performance.now()
      if (now - last >= placementInterval) {
        last = now
        place()
      } else if (timer === undefined) {
        timer = setTimeout(
          () => {
            timer = undefined
            last = performance.now()
            place()
          },
          placementInterval - (now - last)
        )
      }
    })
    return () => {
      unsubscribe()
      clearTimeout(timer)
    }
  }, [camera, place])
  useEffect(() => {
    enabledRef.current = enabled
    place()
  }, [enabled, place])

  // The candidates of the tiles in view
  const setTiles = useCallback(
    (tiles: ReadonlyArray<ContextTileContent>) => {
      const byKey = new Map<string, PlaceLabel>()
      for (const tile of tiles) {
        for (const candidate of tile.places) {
          // Always as it is on the map: in the local language, or in the
          // city's languages where the map writes them together
          const text = candidate.name
          const key = `${text}|${candidate.longitude.toFixed(5)}|${candidate.latitude.toFixed(5)}`
          byKey.set(key, {
            key,
            text,
            longitude: candidate.longitude,
            latitude: candidate.latitude,
            tier: candidate.tier,
            rank: candidate.rank,
            width: textWidth(text) + 2 * halo,
          })
        }
      }
      candidates.current = [...byKey.values()]
      // New characters: loaded first, then the atlas is made again
      const known = characterSetRef.current
      const missing = new Set<string>()
      for (const { text } of candidates.current) {
        for (const character of text) {
          if (character !== " " && !known.includes(character)) {
            missing.add(character)
          }
        }
      }
      if (missing.size === 0) {
        place()
        return
      }
      const characters = [...new Set([...known, ...missing])]
      characters.sort()
      const next = characters.join("")
      void Promise.all(
        fonts.sans
          .slice(0, 2)
          .map((family) =>
            document.fonts.load(`${textWeight} ${textSize}px "${family}"`, next)
          )
      )
        .catch(() => undefined)
        .then(() => {
          if (next.length > characterSetRef.current.length) {
            characterSetRef.current = next
            setCharacterSet(next)
          }
          place()
        })
    },
    [place]
  )

  /** The names to draw now, and how many times they have changed */
  const current = useCallback(
    () => ({
      labels: [...shown.current.values()].filter(({ opacity }) => opacity > 0),
      version: version.current,
    }),
    []
  )

  return { setTiles, current, characterSet }
}

/** The district names, in Ink with a halo in the Surface colour */
export function placeNamesLayer({
  labels,
  version,
  colors,
  characterSet,
  pixelRatio,
  opacity,
}: {
  labels: ReadonlyArray<Shown>
  version: number
  colors: MapColors
  characterSet: string
  pixelRatio: number
  opacity: number
}) {
  return new TextLayer<Shown>({
    id: "place-names",
    data: labels as Array<Shown>,
    getText: ({ label }) => label.text,
    getPosition: ({ label }) => [label.longitude, label.latitude],
    getSize: textSize,
    getColor: ({ opacity: shown }) => [
      colors.ink[0],
      colors.ink[1],
      colors.ink[2],
      Math.round(255 * shown),
    ],
    getTextAnchor: "middle",
    getAlignmentBaseline: "center",
    fontFamily: nameFontFamily,
    fontWeight: textWeight,
    characterSet: `${characterSet} `,
    ...nameTextSettings(pixelRatio, textSize),
    outlineColor: colors.surface,
    opacity,
    // Hidden, it is still made, with its shaders and its font's atlas
    visible: opacity > 0 && labels.length > 0,
    updateTriggers: { getColor: [version, colors.ink.join()] },
  })
}
