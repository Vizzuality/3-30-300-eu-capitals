/*
 * Where each overlay sits on the map, 16 px from its edges: the legend top
 * left, the controls top right and the "Use two fingers" hint in the
 * middle. The attribution, the scale and the key hint share the bottom of
 * the map (see `MapBottom`). The Home label and the pulse's tag follow a
 * point of the map instead. The map needs `relative`.
 */
export const overlayPlacement = {
  legend: "absolute top-map-inset left-map-inset",
  controls: "absolute top-map-inset right-map-inset",
  twoFingerHint:
    "pointer-events-none absolute inset-0 grid place-items-center px-map-inset",
} as const
