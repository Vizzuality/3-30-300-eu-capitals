import { describe, expect, test } from "vitest"

import { isLanguageSwitch } from "@/lib/navigation"

describe("a change of language alone", () => {
  test("only the first segment changes", () => {
    expect(isLanguageSwitch("/en/about", "/fr/about")).toBe(true)
    expect(isLanguageSwitch("/en", "/de")).toBe(true)
    expect(
      isLanguageSwitch("/en/capitals/stockholm", "/sv/capitals/stockholm")
    ).toBe(true)
  })

  test("another page is not a change of language", () => {
    expect(isLanguageSwitch("/en/about", "/en/methodology")).toBe(false)
    expect(isLanguageSwitch("/en/about", "/fr/methodology")).toBe(false)
    expect(isLanguageSwitch("/en", "/en/about")).toBe(false)
  })

  test("the same address is no change at all", () => {
    expect(isLanguageSwitch("/en/about", "/en/about")).toBe(false)
  })
})
