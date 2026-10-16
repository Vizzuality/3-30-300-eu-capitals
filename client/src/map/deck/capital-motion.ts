import { interpolate } from "motion"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"

import { fonts, motionDetails, typeScale } from "@/design/tokens"
import { prefersReducedMotion } from "@/design/reduced-motion"
import { tween, type Tween } from "@/design/tween"
import type { CapitalSlug } from "@/lib/capitals"
import { namesFromZoom, nameCharacters } from "@/map/home-capitals"
import { useMapCamera, type MapCamera } from "@/map/map-camera"
import type { CapitalPress, HomeMap } from "@/map/renderer"
import {
  nameFontFamily,
  type CapitalMotion,
  type NameFont,
} from "./capital-layers"

/*
 * The motion of the Home map's capitals, driven by the shared tween helper
 * with the motion tokens, frame by frame:
 * - Lift: the capital under the pointer, in focus or whose row is pointed
 *   at rises, and the one it leaves settles back (a spring);
 * - Squash and Ring: a pressed capital wobbles once and sends out a ring;
 * - Fade: the names show once the map is close enough to read them.
 * Under reduced motion nothing moves: the lift and the wobble are left out
 * (the edge still turns Ink), the ring is a still one that fades out, and
 * the names fade.
 *
 * The values live in one object that the layers read; `redraw` is called
 * whenever they change.
 */
export function useCapitalMotion({
  home,
  press,
  camera,
  redraw,
}: {
  home: HomeMap | undefined
  press: CapitalPress | undefined
  camera: MapCamera
  /** Stable: the same function for the life of the map */
  redraw: () => void
}): CapitalMotion {
  const [motion] = useState<CapitalMotion>(() => ({
    lift: new Map(),
    squash: undefined,
    ring: undefined,
    names: 0,
  }))

  // Lift: towards 1 for the capital lifted, towards 0 for any other
  const lifts = useRef(new Map<CapitalSlug, { to: number; tween: Tween }>())
  const lifted = home?.lifted
  useEffect(() => {
    const lift = motion.lift as Map<CapitalSlug, number>
    const slugs = new Set([...lift.keys(), ...(lifted ? [lifted] : [])])
    for (const slug of slugs) {
      const to = slug === lifted ? 1 : 0
      const running = lifts.current.get(slug)
      if (running?.to === to || (!running && (lift.get(slug) ?? 0) === to)) {
        continue
      }
      running?.tween.cancel()
      // Under reduced motion, nothing rises: only the edge turns Ink
      const reduced = prefersReducedMotion()
      lifts.current.set(slug, {
        to,
        tween: tween({
          from: lift.get(slug) ?? 0,
          to,
          token: "lift",
          reducedMotion: reduced,
          onUpdate: (value) => {
            lift.set(slug, value)
            redraw()
          },
          onComplete: () => {
            lifts.current.delete(slug)
            if (to === 0) {
              lift.delete(slug)
            }
            redraw()
          },
        }),
      })
    }
  }, [lifted, motion, redraw])

  // Squash and Ring, once per press
  useEffect(() => {
    if (!press) {
      return
    }
    const reduced = prefersReducedMotion()
    const { times, x, y } = motionDetails.squashKeyframes
    const width = interpolate([...times], [...x])
    const height = interpolate([...times], [...y])
    const { ringScale, ringOpacity } = motionDetails
    const squash = reduced
      ? undefined
      : tween({
          from: 0,
          to: 1,
          token: "squash",
          onUpdate: (progress) => {
            motion.squash = {
              slug: press.slug,
              x: width(progress),
              y: height(progress),
            }
            redraw()
          },
          onComplete: () => {
            motion.squash = undefined
            redraw()
          },
        })
    const ring = tween({
      from: 0,
      to: 1,
      token: "ring",
      reducedMotion: reduced,
      onUpdate: (progress) => {
        if (!reduced) {
          motion.ring = {
            at: press.at,
            scale: ringScale.from + (ringScale.to - ringScale.from) * progress,
            opacity: ringOpacity * (1 - progress),
          }
          redraw()
        }
      },
      // Under reduced motion, a still ring that fades out
      onFade: (progress) => {
        motion.ring = {
          at: press.at,
          scale: 1,
          opacity: (ringOpacity / 2) * (1 - progress),
        }
        redraw()
      },
      onComplete: () => {
        motion.ring = undefined
        redraw()
      },
    })
    return () => {
      squash?.cancel()
      ring.cancel()
      motion.squash = undefined
      motion.ring = undefined
    }
  }, [press, motion, redraw])

  // The names fade in once the map is close enough, and out again; as the
  // map first shows, they are there at once
  const showNames = useMapCamera(camera, (state) =>
    state.camera === undefined ? undefined : state.camera.zoom >= namesFromZoom
  )
  const namesShown = useRef(false)
  useEffect(() => {
    if (showNames === undefined) {
      return
    }
    const from = motion.names
    const to = showNames ? 1 : 0
    const fade = (value: number) => {
      motion.names = value
      redraw()
    }
    // As the map first shows, at once, as reduced motion has it
    const first = !namesShown.current
    namesShown.current = true
    if (from === to) {
      return
    }
    const names = tween({
      from,
      to,
      token: "fade",
      onUpdate: fade,
      ...(first
        ? { reducedMotion: true }
        : {
            onFade: (progress: number) => fade(from + (to - from) * progress),
          }),
    })
    return () => names.cancel()
  }, [showNames, motion, redraw])

  return motion
}

/** The screen's device pixels per CSS pixel, followed as it changes */
function usePixelRatio() {
  return useSyncExternalStore(
    (listener) => {
      const media = window.matchMedia(
        `(resolution: ${window.devicePixelRatio}dppx)`
      )
      media.addEventListener("change", listener)
      return () => media.removeEventListener("change", listener)
    },
    () => window.devicePixelRatio,
    () => 1
  )
}

/**
 * The names' font, once the browser has loaded it for every character of
 * the names (Figtree, and Noto Sans for Greek and Cyrillic): deck.gl draws
 * the characters into its atlas once, so they must be ready first
 */
export function useNameFont(
  names: ReadonlyArray<string> | undefined
): NameFont | undefined {
  const characterSet = useMemo(
    () => (names ? nameCharacters(names) : undefined),
    [names]
  )
  const [loaded, setLoaded] = useState<string>()

  useEffect(() => {
    if (!characterSet) {
      return
    }
    let current = true
    const { size, weight } = typeScale.mapName
    void Promise.all(
      fonts.sans
        .slice(0, 2)
        .map((family) =>
          document.fonts.load(`${weight} ${size}px "${family}"`, characterSet)
        )
    )
      // A font that fails to load leaves the next one in the stack
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

  const pixelRatio = usePixelRatio()
  return useMemo(
    () =>
      loaded && loaded === characterSet
        ? { fontFamily: nameFontFamily, characterSet: loaded, pixelRatio }
        : undefined,
    [loaded, characterSet, pixelRatio]
  )
}
