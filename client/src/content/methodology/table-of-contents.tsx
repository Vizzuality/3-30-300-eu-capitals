import { useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useState, type MouseEvent } from "react"
import { useTranslations } from "use-intl"

import { TouchAnchor } from "@/components/motion/touch-link"
import { motionDetails } from "@/design/tokens"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { cn } from "@/lib/utils"
import { methodologySections, type MethodologySectionId } from "./sections"

/*
 * The table of contents of the Methodology page, in the panel: one row per
 * section, numbered, linking to it in the reading page. The section being
 * read is highlighted, and marked as the current location, as the visitor
 * scrolls or follows a link.
 */

// What ends the scroll to a section: it arriving, or the visitor taking over
const takeOver = ["wheel", "touchstart", "keydown", "pointerdown"] as const

/**
 * The section being read: the lowest one in the top part of the window, or
 * the last one that was. While the page glides to a section chosen in the
 * table of contents, that section stays highlighted, rather than each one
 * passed on the way.
 */
function useCurrentSection() {
  const [current, setCurrent] = useState<MethodologySectionId>(
    methodologySections[0].id
  )
  const held = useRef(false)
  const release = useRef<() => void>(undefined)

  useEffect(() => {
    const inView = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            inView.add(entry.target.id)
          } else {
            inView.delete(entry.target.id)
          }
        }
        if (held.current) {
          return
        }
        // The one that starts lowest: a section just scrolled to, rather
        // than the end of the one before it
        const last = methodologySections
          .filter(({ id }) => inView.has(id))
          .at(-1)
        if (last) {
          setCurrent(last.id)
        }
      },
      // The top 30% of the window (the reading page scrolls within it)
      { rootMargin: "0px 0px -70% 0px" }
    )
    for (const { id } of methodologySections) {
      const section = document.getElementById(id)
      if (section) {
        observer.observe(section)
      }
    }
    return () => {
      observer.disconnect()
      release.current?.()
    }
  }, [])

  /** Highlights `id` until the page has scrolled to it */
  const hold = (id: MethodologySectionId) => {
    release.current?.()
    setCurrent(id)
    held.current = true
    // The reading page's scroll end (desktop) or the page's (phones)
    const options = { capture: true, passive: true }
    const done = () => {
      held.current = false
      release.current = undefined
      document.removeEventListener("scrollend", done, options)
      for (const event of takeOver) {
        document.removeEventListener(event, done, options)
      }
    }
    document.addEventListener("scrollend", done, options)
    for (const event of takeOver) {
      document.addEventListener(event, done, options)
    }
    release.current = done
  }

  return [current, hold] as const
}

export function TableOfContents() {
  const t = useTranslations("methodology")
  const navigate = useNavigate()
  const reduced = usePrefersReducedMotion()
  const [current, hold] = useCurrentSection()

  /*
   * The router takes the address to the section and scrolls it into view,
   * gliding there (a jump under reduced motion) and leaving the panel where
   * it is; focus moves to the section, so the next Tab continues from
   * there, as after an in-page link of a plain page. The address changes in
   * place, keeping the page's history entry and its state, so the back link
   * still returns through the history to the page it was opened from.
   */
  const onClick = (
    event: MouseEvent<HTMLAnchorElement>,
    id: MethodologySectionId
  ) => {
    const plain =
      event.button === 0 &&
      !(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
    if (!plain) {
      return
    }
    event.preventDefault()
    hold(id)
    document.getElementById(id)?.focus({ preventScroll: true })
    void navigate({
      to: ".",
      hash: id,
      replace: true,
      state: true,
      resetScroll: false,
      hashScrollIntoView: {
        behavior: reduced ? "instant" : "smooth",
        block: "start",
      },
    })
  }

  return (
    <nav aria-label={t("toc")}>
      <ol className="-mx-2 flex flex-col gap-0.5">
        {methodologySections.map(({ key, id }, index) => (
          <li key={id} className="flex">
            <TouchAnchor
              href={`#${id}`}
              lift={false}
              squashScale={motionDetails.squashRowScale}
              aria-current={current === id ? "location" : undefined}
              onClick={(event) => onClick(event, id)}
              className={cn({
                "grid w-full grid-cols-[26px_minmax(0,1fr)] items-center gap-2.5 rounded-row border px-2 py-2.25 text-list-name font-medium text-ink hover:border-line hover:bg-surface-2": true,
                "border-line bg-surface-2": current === id,
                "border-transparent": current !== id,
              })}
            >
              <span aria-hidden="true" className="text-label text-ink-2">
                {index + 1}
              </span>
              {t(`sections.${key}`)}
            </TouchAnchor>
          </li>
        ))}
      </ol>
    </nav>
  )
}
