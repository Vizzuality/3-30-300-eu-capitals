import { describe, expect, test } from "vitest"

import { capitalArchives } from "@/map/capital-archives"

describe("the archives a capital's map draws from", () => {
  test("a real capital of a real release: every archive", () => {
    expect(capitalArchives({}, "2026-10-all")).toEqual({
      grid: true,
      context: true,
      city: true,
    })
  })

  test("a real capital of the stand-in release: its grid and overview water", () => {
    expect(capitalArchives({}, "stand-in")).toEqual({
      grid: true,
      context: true,
      city: false,
    })
  })

  test("a capital with placeholder figures: none", () => {
    for (const release of ["stand-in", "2026-10-all"]) {
      expect(capitalArchives({ placeholder: true }, release)).toEqual({
        grid: false,
        context: false,
        city: false,
      })
    }
  })
})
