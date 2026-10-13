/*
 * What the stand-in release needs for each capital and the reference design
 * does not give. Residents and areas are rough, rounded figures for the
 * municipality, only so that placeholders look plausible: the pipeline
 * replaces all of them.
 */
import type { CapitalSlug } from "@/lib/capitals"

export type CapitalFacts = {
  /** As written locally */
  localName: string
  /** Language of the local names, BCP 47 */
  language: string
  /** ISO 3166-1 alpha-2 */
  country: string
  /** `[lon, lat]` of the city centre */
  centre: [number, number]
  /** Rough number of residents */
  residents: number
  /** Rough area in km² */
  area: number
}

export const capitalFacts: Record<CapitalSlug, CapitalFacts> = {
  brussels: {
    localName: "Bruxelles",
    language: "fr",
    country: "BE",
    centre: [4.3517, 50.8467],
    residents: 196_000,
    area: 33,
  },
  sofia: {
    localName: "София",
    language: "bg",
    country: "BG",
    centre: [23.3219, 42.6977],
    residents: 1_280_000,
    area: 1349,
  },
  prague: {
    localName: "Praha",
    language: "cs",
    country: "CZ",
    centre: [14.4378, 50.0755],
    residents: 1_360_000,
    area: 496,
  },
  copenhagen: {
    localName: "København",
    language: "da",
    country: "DK",
    centre: [12.5683, 55.6761],
    residents: 660_000,
    area: 88,
  },
  berlin: {
    localName: "Berlin",
    language: "de",
    country: "DE",
    centre: [13.405, 52.52],
    residents: 3_750_000,
    area: 891,
  },
  tallinn: {
    localName: "Tallinn",
    language: "et",
    country: "EE",
    centre: [24.7536, 59.437],
    residents: 457_000,
    area: 159,
  },
  dublin: {
    localName: "Dublin",
    language: "en",
    country: "IE",
    centre: [-6.2603, 53.3498],
    residents: 590_000,
    area: 118,
  },
  athens: {
    localName: "Αθήνα",
    language: "el",
    country: "GR",
    centre: [23.7275, 37.9838],
    residents: 640_000,
    area: 39,
  },
  madrid: {
    localName: "Madrid",
    language: "es",
    country: "ES",
    centre: [-3.7038, 40.4168],
    residents: 3_300_000,
    area: 604,
  },
  paris: {
    localName: "Paris",
    language: "fr",
    country: "FR",
    centre: [2.3522, 48.8566],
    residents: 2_100_000,
    area: 105,
  },
  zagreb: {
    localName: "Zagreb",
    language: "hr",
    country: "HR",
    centre: [15.9819, 45.815],
    residents: 770_000,
    area: 641,
  },
  rome: {
    localName: "Roma",
    language: "it",
    country: "IT",
    centre: [12.4964, 41.9028],
    residents: 2_750_000,
    area: 1287,
  },
  nicosia: {
    localName: "Λευκωσία",
    language: "el",
    country: "CY",
    centre: [33.3823, 35.1856],
    residents: 55_000,
    area: 51,
  },
  riga: {
    localName: "Rīga",
    language: "lv",
    country: "LV",
    centre: [24.1052, 56.9496],
    residents: 605_000,
    area: 304,
  },
  vilnius: {
    localName: "Vilnius",
    language: "lt",
    country: "LT",
    centre: [25.2797, 54.6872],
    residents: 590_000,
    area: 401,
  },
  luxembourg: {
    localName: "Luxembourg",
    language: "fr",
    country: "LU",
    centre: [6.1296, 49.6116],
    residents: 135_000,
    area: 51,
  },
  budapest: {
    localName: "Budapest",
    language: "hu",
    country: "HU",
    centre: [19.0402, 47.4979],
    residents: 1_700_000,
    area: 525,
  },
  valletta: {
    localName: "Il-Belt Valletta",
    language: "mt",
    country: "MT",
    centre: [14.5146, 35.8989],
    residents: 5_200,
    area: 0.61,
  },
  amsterdam: {
    localName: "Amsterdam",
    language: "nl",
    country: "NL",
    centre: [4.9041, 52.3676],
    residents: 930_000,
    area: 219,
  },
  vienna: {
    localName: "Wien",
    language: "de",
    country: "AT",
    centre: [16.3738, 48.2082],
    residents: 2_000_000,
    area: 415,
  },
  warsaw: {
    localName: "Warszawa",
    language: "pl",
    country: "PL",
    centre: [21.0122, 52.2297],
    residents: 1_860_000,
    area: 517,
  },
  lisbon: {
    localName: "Lisboa",
    language: "pt",
    country: "PT",
    centre: [-9.1393, 38.7223],
    residents: 545_000,
    area: 100,
  },
  bucharest: {
    localName: "București",
    language: "ro",
    country: "RO",
    centre: [26.1025, 44.4268],
    residents: 1_720_000,
    area: 228,
  },
  ljubljana: {
    localName: "Ljubljana",
    language: "sl",
    country: "SI",
    centre: [14.5058, 46.0569],
    residents: 295_000,
    area: 275,
  },
  bratislava: {
    localName: "Bratislava",
    language: "sk",
    country: "SK",
    centre: [17.1077, 48.1486],
    residents: 475_000,
    area: 367,
  },
  helsinki: {
    localName: "Helsinki",
    language: "fi",
    country: "FI",
    centre: [24.9384, 60.1699],
    residents: 690_000,
    area: 214,
  },
  stockholm: {
    localName: "Stockholm",
    language: "sv",
    country: "SE",
    centre: [18.0686, 59.3293],
    residents: 1_000_000,
    area: 209,
  },
}
