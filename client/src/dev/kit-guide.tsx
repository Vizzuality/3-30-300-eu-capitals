/*
 * The Next step guide section of the kit page: the guide in every state,
 * moved through with buttons, in English and in German (a third longer),
 * light and dark, with the reduced-motion switch, and the Click and Tap
 * versions side by side. Development only; its explanatory text is not
 * translated, the guide's own text comes from the messages.
 */
import en from "@messages/en.json"
import { useState, type ReactNode } from "react"
import { IntlProvider } from "use-intl"

import { NextStepGuide } from "@/components/guide/next-step-guide"
import { Button } from "@/components/ui/button"
import { timeZone } from "@/i18n/locales"
import type { Messages } from "@/i18n/messages"
import { guideStates, type GuideState } from "@/lib/guide"
import { ReducedMotionSwitch } from "./kit-motion"
import { ThemeScope } from "./kit-theme"

// A draft German version of the guide, to see its text grow: the site's
// German messages come with the translations
const guideInGerman: Messages["guide"] = {
  label: {
    start: "Hier beginnen",
    next: "Weiter · {step, number} von {total, number}",
    facade: "Fassade ausgewählt",
    explore: "Entdecken",
  },
  sentence: {
    home: {
      click:
        "Klicken Sie auf eine Hauptstadt auf der Karte oder auf eine Zeile der Rangliste",
      tap: "Tippen Sie auf eine Hauptstadt auf der Karte oder auf eine Zeile der Rangliste",
    },
    overview: {
      click:
        "Klicken Sie irgendwo auf die Karte, um an eine Straße heranzuzoomen",
      tap: "Tippen Sie irgendwo auf die Karte, um an eine Straße heranzuzoomen",
    },
    street: {
      click:
        "Klicken Sie auf ein Gebäude, um zu sehen, warum es so abschneidet",
      tap: "Tippen Sie auf ein Gebäude, um zu sehen, warum es so abschneidet",
    },
    building: {
      click:
        "Wechseln Sie die Regel mit 3 · 30 · 300 oder klicken Sie auf eine Fassade, um die Bäume zu sehen, die sie sieht",
      tap: "Wechseln Sie die Regel mit 3 · 30 · 300 oder tippen Sie auf eine Fassade, um die Bäume zu sehen, die sie sieht",
    },
    facade: {
      click:
        "Klicken Sie erneut auf die Fassade, um das ganze Gebäude zu sehen",
      tap: "Tippen Sie erneut auf die Fassade, um das ganze Gebäude zu sehen",
    },
    explore: {
      click:
        "Klicken Sie auf ein anderes Gebäude, um es zu vergleichen, oder drücken Sie Esc, um zur Straße zurückzukehren",
      tap: "Tippen Sie auf ein anderes Gebäude, um es zu vergleichen",
    },
  },
}

const languages = {
  en: { name: "English", messages: en },
  de: { name: "German", messages: { ...en, guide: guideInGerman } },
} as const

type Language = keyof typeof languages

// What the visitor sees in each state
const stateNames: Record<GuideState, string> = {
  home: "Home",
  overview: "City overview",
  street: "Street",
  building: "Selected building, rule 3",
  facade: "Selected facade",
  explore: "Rule 30 or 300",
}

const stateNotes: Record<GuideState, string> = {
  home: "Under the intro. No dots: the path starts with a capital.",
  overview:
    "Under the city header. The map's pulse (steps 16–17) sits on the suggested place.",
  street:
    "Not reachable from an address until the map reports its view (step 14 on).",
  building: "?building=…",
  facade: "?building=…&facade=…",
  explore: "?building=…&rule=30 or 300; a facade counts only with rule 3.",
}

// The panel's width on desktop (416 px) and on a 390 px phone (350 px)
const widths = [
  ["Panel, 416 px", "w-full max-w-104"],
  ["Phone, 350 px", "w-full max-w-87.5"],
] as const

function Cell({
  title,
  note,
  children,
}: {
  title: string
  note: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-control font-semibold">{title}</h3>
      {children}
      <p className="max-w-190 text-small text-ink-2">{note}</p>
    </div>
  )
}

/** A choice among a few, as the reference's demo buttons */
function Choice({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      aria-pressed={pressed}
      onClick={onClick}
      // The chosen one is edged in Ink, its content kept in place
      className={pressed ? "border-2 border-ink px-3.75 py-2.25" : undefined}
    >
      {children}
    </Button>
  )
}

function Demo({ state, language }: { state: GuideState; language: Language }) {
  return (
    <div className="grid overflow-hidden rounded-control border border-line desktop:grid-cols-2">
      {(["light", "dark"] as const).map((theme) => (
        <ThemeScope
          key={theme}
          theme={theme}
          className="flex min-w-0 flex-col gap-5 p-5"
        >
          <p className="text-label text-ink-2 uppercase">
            {theme === "light" ? "Light" : "Dark"} · {stateNames[state]}
          </p>
          {widths.map(([name, width]) => (
            <div key={name} className="flex flex-col gap-2">
              <p className="text-small text-ink-2">{name}</p>
              <div lang={language} className={width}>
                <NextStepGuide
                  state={state}
                  // One guide is announced, as on the site
                  live={theme === "light" && name === widths[0][0]}
                />
              </div>
            </div>
          ))}
        </ThemeScope>
      ))}
    </div>
  )
}

function ClickAndTap({
  state,
  language,
}: {
  state: GuideState
  language: Language
}) {
  return (
    <div className="grid gap-4 desktop:grid-cols-2">
      {(["click", "tap"] as const).map((pointer) => (
        <div key={pointer} className="flex flex-col gap-2">
          <p className="text-small text-ink-2">
            {pointer === "click"
              ? "Click: a mouse or a trackpad"
              : "Tap: a finger (hover: none and pointer: coarse)"}
          </p>
          <div lang={language} className="w-full max-w-104">
            <NextStepGuide state={state} pointer={pointer} live={false} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function GuideKit() {
  const [state, setState] = useState<GuideState>("home")
  const [language, setLanguage] = useState<Language>("en")
  const next =
    guideStates[(guideStates.indexOf(state) + 1) % guideStates.length]

  return (
    <IntlProvider
      locale={language}
      messages={languages[language].messages}
      timeZone={timeZone}
    >
      <section
        id="guide"
        aria-labelledby="guide-title"
        className="flex flex-col gap-7 rounded-panel border border-line bg-surface px-8 py-7"
      >
        <div className="flex flex-col gap-2">
          <h2 id="guide-title" className="font-serif text-title">
            Next step guide
          </h2>
          <p className="max-w-190 text-small text-ink-2">
            The block that says what to do next, along the path City → Street →
            Building: filled in Ink with Surface text (the only block filled
            this way), a pointer, the step label, the sentence and three dots
            for the path. It sits under the intro on Home and under the city
            header on a capital, before the map band on phones. Every 3 s its
            pointer taps and sends out one ring (Nudge), three times, then it
            rests; when the state changes, the new guide floats in (Float) and
            nudges three times again. It pauses while the tab is hidden, and is
            still under reduced motion (no tap, no ring). Screen readers hear it
            change within a page (a polite live region); the pointer and the
            dots are hidden from them. The map&apos;s pulse comes with the map.
          </p>
        </div>

        <ReducedMotionSwitch />

        <Cell
          title="Try it"
          note={
            <>
              {stateNotes[state]} Choosing a state is what the visitor&apos;s
              action will do on the site. &ldquo;Click&rdquo; or
              &ldquo;Tap&rdquo; follows this device. German is a draft, to see
              the text grow.
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            {guideStates.map((item) => (
              <Choice
                key={item}
                pressed={item === state}
                onClick={() => setState(item)}
              >
                {stateNames[item]}
              </Choice>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setState(next)}>
              Next: {stateNames[next]}
            </Button>
            {(Object.keys(languages) as Array<Language>).map((item) => (
              <Choice
                key={item}
                pressed={item === language}
                onClick={() => setLanguage(item)}
              >
                {languages[item].name}
              </Choice>
            ))}
          </div>
          <Demo state={state} language={language} />
        </Cell>

        <Cell
          title="Click and Tap"
          note={
            <>
              Both sentences are in the page; CSS shows &ldquo;Tap&rdquo; on
              devices pointed at with a finger and &ldquo;Click&rdquo;
              elsewhere, so the prerendered page is right before any script
              runs. The hidden one is not read by screen readers. Here each is
              forced, for the state chosen above.
            </>
          }
        >
          <ClickAndTap state={state} language={language} />
        </Cell>
      </section>
    </IntlProvider>
  )
}
