import type { SelectedBuilding } from "@/lib/building"

/*
 * Buildings for the kit page's samples, held still: the panel's description
 * of real buildings of Stockholm, from the 2026-10-all release (their
 * evidence and their facades' attributes), as the map reads them from the
 * capital's tiles. Development only.
 */

// Rule 3 met, the others not (Södermalm), with its 17 facades
export const southern: SelectedBuilding = {
  id: 31947,
  residents: { amount: "about", residents: 151 },
  met: { "3": true, "30": false, "300": false },
  trees: { percent: 54, facades: 17, passing: 5 },
  canopy: { percent: 20 },
  walk: { kind: "route", metres: 361, park: "Vita bergen" },
  facades: [
    {
      id: 102279,
      orientation: "NW",
      residents: { amount: "about", residents: 20 },
      trees: 4,
      met: true,
    },
    {
      id: 102280,
      orientation: "SW",
      residents: { amount: "about", residents: 8 },
      trees: 2,
      met: false,
    },
    {
      id: 102281,
      orientation: "SE",
      residents: { amount: "about", residents: 5 },
      trees: 0,
      met: false,
    },
    {
      id: 102282,
      orientation: "SW",
      residents: { amount: "about", residents: 11 },
      trees: 0,
      met: false,
    },
    {
      id: 102283,
      orientation: "NW",
      residents: { amount: "about", residents: 2 },
      trees: 0,
      met: false,
    },
    {
      id: 102284,
      orientation: "SW",
      residents: { amount: "about", residents: 9 },
      trees: 0,
      met: false,
    },
    {
      id: 102285,
      orientation: "SW",
      residents: { amount: "about", residents: 7 },
      trees: 0,
      met: false,
    },
    {
      id: 102286,
      orientation: "NW",
      residents: { amount: "about", residents: 2 },
      trees: 0,
      met: false,
    },
    {
      id: 102287,
      orientation: "SW",
      residents: { amount: "about", residents: 4 },
      trees: 0,
      met: false,
    },
    {
      id: 102288,
      orientation: "NW",
      residents: { amount: "about", residents: 2 },
      trees: 0,
      met: false,
    },
    {
      id: 102289,
      orientation: "SW",
      residents: { amount: "about", residents: 8 },
      trees: 2,
      met: false,
    },
    {
      id: 102290,
      orientation: "SE",
      residents: { amount: "about", residents: 18 },
      trees: 6,
      met: true,
    },
    {
      id: 102291,
      orientation: "NE",
      residents: { amount: "about", residents: 8 },
      trees: 5,
      met: true,
    },
    {
      id: 102292,
      orientation: "NW",
      residents: { amount: "about", residents: 4 },
      trees: 3,
      met: true,
    },
    {
      id: 102293,
      orientation: "NE",
      residents: { amount: "about", residents: 31 },
      trees: 6,
      met: true,
    },
    {
      id: 102294,
      orientation: "SE",
      residents: { amount: "about", residents: 5 },
      trees: 2,
      met: false,
    },
    {
      id: 102295,
      orientation: "NE",
      residents: { amount: "about", residents: 8 },
      trees: 1,
      met: false,
    },
  ],
}

// Rule 300 met, the others not (Södermalm)
export const nearPark: SelectedBuilding = {
  id: 4176,
  residents: { amount: "about", residents: 68 },
  met: { "3": false, "30": false, "300": true },
  trees: { percent: 45, facades: 6, passing: 3 },
  canopy: { percent: 10 },
  walk: { kind: "route", metres: 237, park: "Rosenlundsparken" },
  facades: [],
}

// All three met (Bromma)
export const green: SelectedBuilding = {
  id: 1227,
  residents: { amount: "about", residents: 32 },
  met: { "3": true, "30": true, "300": true },
  trees: { percent: 76, facades: 9, passing: 5 },
  canopy: { percent: 40 },
  walk: { kind: "route", metres: 35, park: "Sångarlunden" },
  facades: [],
}

// All three met, the nearest park without a name (Bromma)
export const unnamedPark: SelectedBuilding = {
  id: 2677,
  residents: { amount: "about", residents: 31 },
  met: { "3": true, "30": true, "300": true },
  trees: { percent: 75, facades: 4, passing: 2 },
  canopy: { percent: 42 },
  walk: { kind: "route", metres: 19, park: null },
  facades: [],
}

// Next to a wood (Kungsholmen)
export const touching: SelectedBuilding = {
  id: 43031,
  residents: { amount: "about", residents: 20 },
  met: { "3": false, "30": false, "300": true },
  trees: { percent: 43, facades: 5, passing: 1 },
  canopy: { percent: 14 },
  walk: { kind: "touching", metres: 0, park: "Stadshagen" },
  facades: [],
}

// No path to a park (Kungsholmen)
export const unreachable: SelectedBuilding = {
  id: 64634,
  residents: { amount: "about", residents: 2 },
  met: { "3": false, "30": false, "300": false },
  trees: { percent: 0, facades: 5, passing: 0 },
  canopy: { percent: 18 },
  walk: { kind: "none", metres: 0, park: null },
  facades: [],
}
