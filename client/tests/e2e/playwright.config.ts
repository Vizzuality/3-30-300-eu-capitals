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

/*
 * Locally, the tests with motion wait for the others, so nothing competes
 * with them for the processor. In CI they run in a job of their own, so a
 * failure elsewhere never skips them.
 */
const after = (...projects: Array<string>) =>
  process.env.CI ? undefined : projects

export default defineConfig({
  testDir: ".",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // A run with this many failures stops: the rest would only fail slower
  maxFailures: process.env.CI ? 5 : undefined,
  // The browsers draw WebGL on the processor, so more workers starve the
  // pages: one per CI runner (the suite is split across several runners),
  // four on a laptop
  workers: process.env.CI ? 1 : 4,
  // In CI, the runners share out single tests rather than whole files, so
  // each gets about as much to do
  fullyParallel: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Without the timeline's screenshots, which take processor time from
    // the retried test on a slow runner
    trace: { mode: "on-first-retry", screenshots: false },
  },
  // The machine's Chrome, as in the accessibility tests. The map draws with
  // WebGL on Chrome's software renderer (SwiftShader), the same with or
  // without a GPU, so it runs alike on a laptop and in CI.
  //
  // Every flow runs as a visitor who asks for reduced motion, a mode the
  // site honours: the camera jumps and nothing waits for an animation, so
  // the tests run side by side without the software renderer holding them
  // back. The few tests about an animation itself (tagged @motion) run with
  // motion, one at a time: locally once the others are done, in CI on a
  // runner of their own.
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
      dependencies: after("desktop", "phone"),
      use: { ...desktop, reducedMotion: "no-preference" },
    },
    {
      // One after the other: locally by depending on the desktop run, in CI
      // because its runner has one worker
      name: "phone, with motion",
      grep: /@motion/,
      workers: 1,
      dependencies: after("desktop, with motion"),
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
