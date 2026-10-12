import { defineConfig, devices } from "@playwright/test"

const PORT = 4173

const desktop = { ...devices["Desktop Chrome"], channel: "chrome" }
const phone = { ...devices["Pixel 7"], channel: "chrome" }

export default defineConfig({
  testDir: ".",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  // The machine's Chrome, as in the accessibility tests.
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
