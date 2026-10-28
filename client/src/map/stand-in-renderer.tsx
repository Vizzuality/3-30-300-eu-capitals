import { useEffect } from "react"

import type { MapRendererProps } from "./renderer"

/*
 * The map without WebGL, for the accessibility tests: axe cannot see inside
 * a canvas, and the tests must not need a GPU. It draws nothing and carries
 * out each camera move at once, so the map's focus stop, its keys, its
 * overlays and its announcements run as they do on the real map. What the
 * map shows is checked through its text equivalent (the ranking, the
 * capital's header and the card). Its transitions between places end as
 * soon as they arrive.
 */
export default function StandInRenderer({
  camera,
  transition,
  onTransitionEnd,
}: MapRendererProps) {
  useEffect(() => {
    let last = camera.state.request
    if (last) {
      camera.report(last.camera, { gesture: false })
    }
    return camera.subscribe(() => {
      const { request } = camera.state
      if (request && request !== last) {
        last = request
        const target = request.camera
        queueMicrotask(() => camera.report(target, { gesture: false }))
      }
    })
  }, [camera])

  // Nothing to draw: a transition ends as soon as its place has arrived
  const arrived =
    transition?.phase === "arriving" && transition.ready
      ? transition.id
      : undefined
  useEffect(() => {
    if (arrived !== undefined) {
      queueMicrotask(() => onTransitionEnd?.(arrived))
    }
  }, [arrived, onTransitionEnd])

  return <div data-stand-in-map="" className="absolute inset-0" />
}
