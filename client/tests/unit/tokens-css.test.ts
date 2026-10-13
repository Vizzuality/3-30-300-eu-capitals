import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"

import { toCssName, tokensCss } from "@/design/tokens-css"

describe("design tokens as CSS", () => {
  test("tokens.css matches tokens.ts (run `pnpm tokens` after a change)", () => {
    // Read from the client folder, where the tests run
    const file = readFileSync("src/design/tokens.css", "utf8")

    expect(file).toBe(tokensCss())
  })

  test("names become the CSS names the classes use", () => {
    expect(toCssName("surface2")).toBe("surface-2")
    expect(toCssName("resultMuted0")).toBe("result-muted-0")
    expect(toCssName("streetCasing")).toBe("street-casing")
    expect(toCssName("panelInsetPhone")).toBe("panel-inset-phone")
  })

  test("each colour switches with the colour scheme", () => {
    const [light, dark] = tokensCss().split(
      "@media (prefers-color-scheme: dark)"
    )

    expect(light).toContain("--result-3: #77361a;")
    expect(dark).toContain("--result-3: #faad8f;")
  })
})
