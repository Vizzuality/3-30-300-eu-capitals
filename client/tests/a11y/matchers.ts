import axe from "axe-core"
import type { Result } from "axe-core"
import { expect } from "vitest"

declare module "vitest" {
  interface Matchers<R, T> {
    /**
     * Runs axe-core on the element with the EN 301 549 rules (the European
     * accessibility standard for public websites, which includes WCAG 2.1 AA).
     */
    toHaveNoA11yViolations: () => Promise<void>
  }
}

function formatViolation({
  id,
  impact,
  help,
  description,
  helpUrl,
  nodes,
}: Result) {
  const elements = nodes.map(
    ({ target, failureSummary }) =>
      `    - ${target.join(" ")}\n      ${failureSummary?.replaceAll("\n", "\n      ")}`
  )

  return [
    `[${impact}] ${id}: ${help}`,
    `  ${description}`,
    `  ${helpUrl}`,
    `  Elements (${nodes.length}):`,
    ...elements,
  ].join("\n")
}

expect.extend({
  async toHaveNoA11yViolations(received: Element) {
    const { violations } = await axe.run(received, {
      runOnly: { type: "tag", values: ["EN-301-549"] },
      resultTypes: ["violations"],
    })

    return {
      pass: violations.length === 0,
      message: () =>
        violations.length === 0
          ? "Expected accessibility violations, found none"
          : `Found ${violations.length} accessibility violation(s):\n\n${violations.map(formatViolation).join("\n\n")}`,
    }
  },
})
