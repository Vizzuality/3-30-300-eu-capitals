import { useId, useRef, type KeyboardEvent } from "react"

import { ClearIcon, SearchIcon } from "@/components/icons"
import { IconButton } from "@/components/ui/icon-button"
import { cn } from "@/lib/utils"

/*
 * A search field, as in the A–Z list: a 48 px Surface 2 box edged by a
 * hairline, with a magnifier, the text typed and, once something is typed, a
 * button that clears it. Its label is its placeholder for the eye, and a
 * visually hidden label for screen readers. Focused, it takes an Ink edge and
 * the 2 px Ink focus ring of every control. Escape clears it too, as the
 * browsers' own search fields do (the browsers' own clear button is hidden,
 * since not every browser has one).
 */
export function SearchField({
  label,
  clearLabel,
  value,
  onValueChange,
  className,
  ...props
}: {
  label: string
  clearLabel: string
  value: string
  onValueChange: (value: string) => void
  className?: string
  // The kit page shows the focus ring at rest
  "data-force-focus"?: true
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)

  const clear = () => {
    onValueChange("")
    input.current?.focus()
  }

  return (
    <div
      data-slot="search-field"
      className={cn(
        "flex h-12 items-center gap-2.5 rounded-control border border-line bg-surface-2 pr-2.5 pl-3.5 text-ink-2 transition-colors has-[input:focus-visible]:border-ink has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring data-force-focus:border-ink",
        className
      )}
      {...props}
    >
      <SearchIcon className="flex-none" />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        ref={input}
        id={id}
        type="search"
        placeholder={label}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          // Escape on an empty field is left to what holds it
          if (event.key === "Escape" && value !== "") {
            event.preventDefault()
            event.stopPropagation()
            onValueChange("")
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-field text-ink placeholder:text-ink-2 focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value !== "" && (
        <IconButton variant="field" label={clearLabel} onClick={clear}>
          <ClearIcon />
        </IconButton>
      )}
    </div>
  )
}
