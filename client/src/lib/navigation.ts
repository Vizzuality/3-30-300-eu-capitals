/*
 * What happens to focus and to screen readers when the page changes, as
 * after a full page load: focus goes back to the start of the document, so
 * the next Tab reaches the skip link, and the new page's name is announced.
 * A change of language alone, or of the map's state, keeps focus where it is.
 */

/**
 * Whether going from one page's address to another's only changes the
 * language, the first segment (`/en/about` → `/fr/about`)
 */
export function isLanguageSwitch(from: string, to: string) {
  return from !== to && withoutLanguage(from) === withoutLanguage(to)
}

function withoutLanguage(path: string) {
  return path.split("/").slice(2).join("/")
}

/**
 * Moves focus to the start of the document, as a full page load does. The
 * body is made focusable for the moment it takes focus, so the next Tab
 * starts from the top of the page; it never shows a focus ring.
 */
export function resetFocus() {
  const { body } = document
  const tabindex = body.getAttribute("tabindex")
  body.tabIndex = -1
  body.focus({ preventScroll: true, focusVisible: false })
  if (tabindex === null) {
    body.removeAttribute("tabindex")
  } else {
    body.setAttribute("tabindex", tabindex)
  }
  // A selection left in the old page would also set where Tab starts from
  const selection = window.getSelection()
  if (selection && selection.type !== "None") {
    selection.removeAllRanges()
  }
}

/** The name of the page shown: its title, or its main heading without one */
export function pageName() {
  return (
    document.title.trim() ||
    document.querySelector("main h1:not([inert] *)")?.textContent?.trim() ||
    ""
  )
}
