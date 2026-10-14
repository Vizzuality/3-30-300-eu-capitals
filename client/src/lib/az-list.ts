import type { Capital } from "@/data/schemas"
import { nameIn } from "@/i18n/names"

/*
 * The A–Z list of Home: the capitals in alphabetical order in the visitor's
 * language, each with its country, and the search that narrows it. The
 * search finds a capital by its name in the visitor's language, by its local
 * name (København, Αθήνα) and by its country, ignoring accents and case, so
 * "Kobenhavn" finds Copenhagen.
 */

// Letters that are not a base letter with an accent, so removing accents
// leaves them as they are, written as the letters visitors type instead
const foldedLetters: Record<string, string> = {
  æ: "ae",
  ð: "d",
  đ: "d",
  ħ: "h",
  ı: "i",
  ł: "l",
  ø: "o",
  œ: "oe",
  ß: "ss",
  þ: "th",
  // Greek's final sigma
  ς: "σ",
}

/**
 * A name or a search as the search compares them: in lower case, without
 * accents, with every run of spaces and punctuation as one space
 * ("Il-Belt Valletta" is "il belt valletta", "Rīga" is "riga")
 */
export function foldForSearch(text: string) {
  return (
    text
      .normalize("NFD")
      // The accents, split from their letters
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[æðđħıłøœßþς]/g, (letter) => foldedLetters[letter])
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
  )
}

/** The capital data the list needs: its names and its country */
type Listed = Pick<Capital, "slug" | "name" | "local_name" | "country">

export type AzCapital<Item extends Listed = Listed> = {
  capital: Item
  /** In the visitor's language */
  name: string
  country: string
  /** The names the search finds it by, folded */
  searchable: Array<string>
}

/**
 * The capitals in alphabetical order, in the visitor's language and
 * alphabet (`Intl.Collator`): in Swedish, Ö comes after Z; in German, with O
 */
export function azList<Item extends Listed>(
  capitals: ReadonlyArray<Item>,
  locale: string
): Array<AzCapital<Item>> {
  const collator = new Intl.Collator(locale)

  const list = capitals.map((capital) => {
    const name = nameIn(capital.name, locale)
    const country = nameIn(capital.country.name, locale)
    return {
      capital,
      name,
      country,
      searchable: [name, capital.local_name, country].map(foldForSearch),
    }
  })
  list.sort((a, b) => collator.compare(a.name, b.name))
  return list
}

/**
 * The capitals found by a search: those with a name that has a word starting
 * with it, in the list's order. An empty search finds them all.
 */
export function searchAz<Item extends Listed>(
  list: Array<AzCapital<Item>>,
  search: string
): Array<AzCapital<Item>> {
  const folded = foldForSearch(search)
  if (folded === "") {
    return list
  }

  return list.filter(({ searchable }) =>
    searchable.some((name) => ` ${name}`.includes(` ${folded}`))
  )
}
