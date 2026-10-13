/**
 * Makes a control easy to hit without changing its look: an invisible layer,
 * centred on it, at least as tall (and as wide) as the smallest touch target,
 * 40 px on desktop and 44 px on phones. The control needs `relative`. For
 * controls that stay still, such as text links: controls that rise and
 * squash get a hit area that stays still from `useTouchMotion`.
 */
export const hitTarget =
  "before:absolute before:top-1/2 before:left-1/2 before:size-full before:min-h-target before:min-w-target before:-translate-x-1/2 before:-translate-y-1/2 max-desktop:before:min-h-target-phone max-desktop:before:min-w-target-phone"
