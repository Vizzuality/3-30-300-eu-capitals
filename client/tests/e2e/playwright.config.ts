import { defineConfig, devices } from "@playwright/test"

const PORT = 4173

const launchOptions = {
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
}

const desktop = {
  ...devices["Desktop Chrome"],
  channel: "chrome",
  launchOptions,
}
const phone = { ...devices["Pixel 7"], channel: "chrome", launchOptions }

export default defineConfig({
  testDir: ".",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // The browsers draw WebGL on the processor, so more workers starve the pages
  // (CI keeps Playwright's default: half its cores)
  workers: process.env.CI ? undefined : 4,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  // The machine's Chrome, as in the accessibility tests. The map draws with
  // WebGL on Chrome's software renderer (SwiftShader), the same with or
  // without a GPU, so it runs alike on a laptop and in CI.
  //
  // Every flow runs as a visitor who asks for reduced motion, a mode the
  // site honours: the camera jumps and nothing waits for an animation, so
  // the tests run side by side without the software renderer holding them
  // back. The few tests about an animation itself (tagged @motion) run with
  // motion, one at a time, once the others are done, so nothing competes
  // with them for the processor.
  projects: [
    {
      name: "desktop",
      grepInvert: /@motion/,
      use: { ...desktop, reducedMotion: "reduce" },
    },
    {
      name: "phone",
      grepInvert: /@motion/,
      use: { ...phone, reducedMotion: "reduce" },
    },
    {
      name: "desktop, with motion",
      grep: /@motion/,
      workers: 1,
      dependencies: ["desktop", "phone"],
      use: { ...desktop, reducedMotion: "no-preference" },
    },
    {
      name: "phone, with motion",
      grep: /@motion/,
      workers: 1,
      dependencies: ["desktop, with motion"],
      use: { ...phone, reducedMotion: "no-preference" },
    },
  ],
  // Always a production build, never the development server
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
