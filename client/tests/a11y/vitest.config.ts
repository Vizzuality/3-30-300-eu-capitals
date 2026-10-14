import { defineConfig } from "vitest/config"
import { playwright } from "@vitest/browser-playwright"
import type { BrowserContextOptions } from "playwright"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const DESKTOP = { width: 1280, height: 720 }
const PHONE_PORTRAIT = { width: 390, height: 844 }
const PHONE_LANDSCAPE = { width: 844, height: 390 }
const PHONE = { deviceScaleFactor: 3, isMobile: true, hasTouch: true }

/*
 * One browser setup: the machine's Chrome at a given size, with reduced motion
 * so that every page is checked in its final state.
 */
function setup(
  name: string,
  viewport: { width: number; height: number },
  contextOptions: BrowserContextOptions = {}
) {
  return {
    browser: "chromium" as const,
    name,
    viewport,
    // Read by the setup file, to keep each setup's failure screenshots apart
    provide: { setup: name },
    provider: playwright({
      launchOptions: { channel: "chrome" },
      contextOptions: { viewport, reducedMotion: "reduce", ...contextOptions },
    }),
  }
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), viteReact()],
  test: {
    name: "a11y",
    include: ["tests/a11y/**/*.test.tsx"],
    setupFiles: ["tests/a11y/matchers.ts", "tests/a11y/setup.ts"],
    // axe-core checks the whole page: on the kit page's sections, which show
    // every state twice (light and dark), it takes several seconds, and
    // longer while the six setups run side by side
    testTimeout: 60_000,
    browser: {
      enabled: true,
      headless: true,
      // Vitest names its own screenshots by test only, so each setup would
      // overwrite the others': the setup file takes them instead
      screenshotFailures: false,
      instances: [
        setup("desktop", DESKTOP),
        // 200% zoom: half the CSS pixels, each drawn twice as large
        setup(
          "desktop-zoom-200",
          { width: DESKTOP.width / 2, height: DESKTOP.height / 2 },
          { deviceScaleFactor: 2 }
        ),
        setup("phone-portrait", PHONE_PORTRAIT, PHONE),
        setup("phone-landscape", PHONE_LANDSCAPE, PHONE),
        setup("desktop-dark", DESKTOP, { colorScheme: "dark" }),
        setup("phone-dark", PHONE_PORTRAIT, { ...PHONE, colorScheme: "dark" }),
      ],
    },
  },
})
