import { describe, expect, test } from "vitest"

import { sourcesSchema } from "@/data/schemas"
import { imageryDates, leafOffImagery } from "@/lib/imagery-season"
import sourcesFile from "@fixtures/release/sources.json"

// The stand-in keeps the real release's sources of every capital
const { capitals } = sourcesSchema.parse(sourcesFile)

const utc = (value: string) => new Date(value)

describe("the imagery taken outside full leaf", () => {
  test("the months of each capital, from the release, in the order given", () => {
    expect(imageryDates(capitals, leafOffImagery.whole)).toEqual([
      {
        slug: "valletta",
        months: { start: utc("2020-01-18T00:00:00Z"), precision: "month" },
      },
      {
        slug: "lisbon",
        months: { start: utc("2020-02-03T00:00:00Z"), precision: "month" },
      },
      {
        slug: "bucharest",
        months: {
          start: utc("2019-02-19T00:00:00Z"),
          end: utc("2019-05-03T00:00:00Z"),
          precision: "month",
        },
      },
      {
        slug: "copenhagen",
        months: {
          start: utc("2020-04-07T00:00:00Z"),
          end: utc("2020-05-22T00:00:00Z"),
          precision: "month",
        },
      },
      // Over several years: named without its months
      { slug: "ljubljana", months: undefined },
    ])
  })

  test("a capital the release does not list is left out", () => {
    const { stockholm } = capitals

    expect(
      imageryDates({ stockholm }, ["valletta", "stockholm", "rome"])
    ).toEqual([
      {
        slug: "stockholm",
        months: {
          start: utc("2020-06-12T00:00:00Z"),
          precision: "month",
        },
      },
    ])
  })
})
