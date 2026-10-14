import messages from "@messages/en.json"
import { createTranslator } from "use-intl"
import { describe, expect, test } from "vitest"

import { residentsFigure } from "@/lib/residents"

describe("a capital's residents", () => {
  test("are rounded to three significant digits, half up", () => {
    expect(residentsFigure(1_033_095).residents).toBe(1_030_000)
    expect(residentsFigure(196_499).residents).toBe(196_000)
    expect(residentsFigure(196_500).residents).toBe(197_000)
    expect(residentsFigure(5_200).residents).toBe(5_200)
    expect(residentsFigure(55).residents).toBe(55)
    expect(residentsFigure(0).residents).toBe(0)
  })

  test("are said in millions from one million, once rounded", () => {
    expect(residentsFigure(1_000_000).scale).toBe("millions")
    expect(residentsFigure(999_500).scale).toBe("millions")
    expect(residentsFigure(999_499).scale).toBe("units")
    expect(residentsFigure(690_000).scale).toBe("units")
  })

  test("are said with the country, in words for millions", () => {
    const t = createTranslator({ locale: "en", messages, namespace: "capital" })
    const say = (residents: number) =>
      t("residents", { country: "Sweden", ...residentsFigure(residents) })
    expect(say(1_033_095)).toBe("Sweden · about 1.03 million residents")
    expect(say(3_750_000)).toBe("Sweden · about 3.75 million residents")
    expect(say(999_600)).toBe("Sweden · about 1 million residents")
    expect(say(196_000)).toBe("Sweden · about 196,000 residents")
    expect(say(5_213)).toBe("Sweden · about 5,210 residents")
  })
})
