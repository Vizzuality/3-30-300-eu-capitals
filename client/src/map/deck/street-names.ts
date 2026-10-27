import { TextLayer } from "@deck.gl/layers"
import { useCallback, useEffect, useRef, useState } from "react"

import { fonts, motionDetails, motionTokens, typeScale } from "@/design/tokens"
import { prefersReducedMotion } from "@/design/reduced-motion"
import {
  boxOfRect,
  placeStreetNames,
  type NameCandidate,
} from "@/lib/street-name-placement"
import { viewportOf } from "@/map/camera"
import type { MapCamera } from "@/map/map-camera"
import type { MapColors } from "@/map/map-colors"
import { nameFontFamily, nameTextSettings } from "./capital-layers"
import type { CityTileContent } from "./city-tile-decode"

/*
 * The street names at street level: the candidates the pipeline prepared,
 * from the city tiles in view, placed on the CPU so that no two names meet
 * and none covers the map's controls (`placeStreetNames`), when the camera
 * stops and every 100 ms while it moves, and drawn by a `TextLayer` turned
 * along their streets. Names that appear or disappear fade in or out
 * (Fade). They show from zoom 15, where the tiles have them and there is
 * room to read them.
 */

/** The zoom from which street names show */
export const namesFromZoom = 15

/** The text box's height, halo included, and the room kept around it */
const boxHeight = 15
const boxPadding = 3
/** Room kept free at each end of a street's straight stretch, in pixels */
const streetMargin = 6
/** The least distance between two names of the same street, in pixels */
const sameStreet = 220
/** Room kept from the map's edges, in pixels */
const edgeInset = 2
/** How often names are placed again while the camera moves */
const placementInterval = 100

/** What covers the map, which names keep clear of */
export const obstacleAttribute = "data-map-obstacle"

/**
 * The boxes of what lies over the map, relative to it, with some room
 * around them: the elements marked as obstacles that are shown, and on the
 * phone, the band's fade into the page at its bottom
 */
export function mapObstacles(element: HTMLElement | null, room: number) {
  if (!element) {
    return []
  }
  const origin = element.getBoundingClientRect()
  const relative = (
    rect: DOMRect | { left: number; top: number; right: number; bottom: number }
  ) =>
    boxOfRect(
      {
        left: rect.left - origin.left,
        top: rect.top - origin.top,
        right: rect.right - origin.left,
        bottom: rect.bottom - origin.top,
      },
      room
    )
  const boxes = [...element.querySelectorAll(`[${obstacleAttribute}]`)]
    .filter((overlay) => overlay.checkVisibility({ visibilityProperty: true }))
    .map((overlay) => relative(overlay.getBoundingClientRect()))
  const band = element.closest<HTMLElement>('[data-map-slot="phone"]')
  if (band) {
    const fade = Number.parseFloat(getComputedStyle(band, "::after").height)
    const rect = band.getBoundingClientRect()
    if (fade > 0) {
      boxes.push(
        relative({
          left: rect.left,
          right: rect.right,
          top: rect.bottom - fade,
          bottom: rect.bottom,
        })
      )
    }
  }
  return boxes
}

type Shown = { candidate: NameCandidate; opacity: number; target: number }

const easeInOut = (value: number) =>
  value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2

/** A candidate's key: the same name at the same place for the same zoom */
const keyOf = (label: CityTileContent["labels"][number]) =>
  `${label.name}|${label.longitude.toFixed(6)}|${label.latitude.toFixed(6)}|${label.z}`

/**
 * The street names' font, once the browser has loaded it for every
 * character of the capital's names (Figtree, and Noto Sans for Greek and
 * Cyrillic): deck.gl draws the characters into its atlas once
 */
export function useStreetNameFont(characters: string | undefined) {
  const characterSet = characters === undefined ? undefined : `${characters} `
  const [loaded, setLoaded] = useState<string>()
  useEffect(() => {
    if (!characterSet) {
      return
    }
    let current = true
    const { size, weight } = typeScale.streetName
    void Promise.all(
      fonts.sans
        .slice(0, 2)
        .map((family) =>
          document.fonts.load(`${weight} ${size}px "${family}"`, characterSet)
        )
    )
      .catch(() => undefined)
      .then(() => {
        if (current) {
          setLoaded(characterSet)
        }
      })
    return () => {
      current = false
    }
  }, [characterSet])
  return loaded !== undefined && loaded === characterSet ? loaded : undefined
}

export function useStreetNames({
  camera,
  root,
  shown: enabled,
  redraw,
}: {
  camera: MapCamera
  /** The map's element, whose overlays the names keep clear of */
  root: () => HTMLElement | null
  /** Whether names may show (at street level, once the arrival is over) */
  shown: boolean
  redraw: () => void
}) {
  const candidates = useRef<Array<NameCandidate>>([])
  const shown = useRef(new Map<string, Shown>())
  // Counts the changes of the names' opacities, which change in place
  const version = useRef(0)
  const enabledRef = useRef(enabled)

  const fading = useRef(false)
  const lastFrame = useRef(0)
  const startFade = useCallback(() => {
    if (fading.current) {
      return
    }
    fading.current = true
    lastFrame.current = performance.now()
    const frame = (now: number) => {
      const duration = prefersReducedMotion()
        ? Math.min(motionTokens.fade.duration, motionDetails.reducedFade)
        : motionTokens.fade.duration
      const step = (now - lastFrame.current) / duration
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
    let placed: Array<NameCandidate> = []
    if (view && enabledRef.current && view.zoom >= namesFromZoom - 1e-6) {
      const viewport = viewportOf(view, size)
      const obstacles = mapObstacles(root(), 4)
      const previous = new Set(
        [...entries.values()]
          .filter(({ target }) => target === 1)
          .map(({ candidate }) => candidate.key)
      )
      placed = placeStreetNames(candidates.current, {
        project: (longitude, latitude) => {
          const [x, y] = viewport.project([longitude, latitude])
          return [x, y]
        },
        zoom: view.zoom,
        size,
        height: boxHeight,
        padding: boxPadding,
        margin: streetMargin,
        sameStreet,
        inset: edgeInset,
        obstacles,
        previous,
      }).map(({ candidate }) => candidate)
    }
    const kept = new Set(placed.map(({ key }) => key))
    let changed = false
    for (const candidate of placed) {
      const entry = entries.get(candidate.key)
      if (!entry) {
        entries.set(candidate.key, { candidate, opacity: 0, target: 1 })
        changed = true
      } else if (entry.target !== 1) {
        entry.target = 1
        changed = true
      }
    }
    for (const entry of entries.values()) {
      if (!kept.has(entry.candidate.key) && entry.target !== 0) {
        entry.target = 0
        changed = true
      }
    }
    if (changed) {
      startFade()
    }
  }, [camera, root, startFade])

  // When the camera stops, and every 100 ms while it moves
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

  const setTiles = useCallback(
    (tiles: ReadonlyArray<CityTileContent>) => {
      const byKey = new Map<string, NameCandidate>()
      for (const tile of tiles) {
        for (const label of tile.labels) {
          const key = keyOf(label)
          byKey.set(key, {
            key,
            name: label.name,
            longitude: label.longitude,
            latitude: label.latitude,
            angle: label.angle,
            z: label.z,
            length: label.length,
            width: label.width,
            rank: label.rank,
            streetLength: label.streetLength,
          })
        }
      }
      candidates.current = [...byKey.values()]
      place()
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

  return { setTiles, current }
}

/** The street names, turned along their streets, in Ink 2 with a halo in the Street colour */
export function streetNamesLayer({
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
  const { size, weight } = typeScale.streetName
  return new TextLayer<Shown>({
    id: "street-names",
    data: labels as Array<Shown>,
    getText: ({ candidate }) => candidate.name,
    getPosition: ({ candidate }) => [candidate.longitude, candidate.latitude],
    getAngle: ({ candidate }) => candidate.angle,
    getSize: size,
    getColor: ({ opacity: shown }) => [
      colors.ink2[0],
      colors.ink2[1],
      colors.ink2[2],
      Math.round(255 * easeInOut(shown)),
    ],
    fontFamily: nameFontFamily,
    fontWeight: weight,
    characterSet,
    ...nameTextSettings(pixelRatio, size),
    outlineColor: colors.street,
    opacity,
    // Hidden, it is still made, with its shaders and its font's atlas
    visible: opacity > 0 && labels.length > 0,
    updateTriggers: { getColor: [version, colors.ink2.join()] },
  })
}
