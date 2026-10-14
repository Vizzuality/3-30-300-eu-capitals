/*
 * A capital's number of residents, as its page's header says it: "about 1.03
 * million residents", "about 196,000 residents". Residents are modelled from
 * a population grid, so the figure is rounded, never given to the last
 * resident.
 */

export type ResidentsFigure = {
  /** Rounded to three significant digits */
  residents: number
  /** Whether it is said in millions, or as a whole number */
  scale: "millions" | "units"
}

/**
 * A number of residents rounded to three significant digits (half up), and
 * whether it is said in millions: from one million, once rounded
 */
export function residentsFigure(residents: number): ResidentsFigure {
  const rounded = residents > 0 ? Number(residents.toPrecision(3)) : 0
  return {
    residents: rounded,
    scale: rounded >= 1_000_000 ? "millions" : "units",
  }
}
