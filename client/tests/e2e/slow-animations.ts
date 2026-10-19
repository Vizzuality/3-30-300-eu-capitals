import type { Page } from "@playwright/test"

/**
 * Plays the page's animations ten times slower from now on, until the
 * returned function brings them back to normal speed.
 *
 * Each animation is slowed on its own, from the first frame it runs in, and
 * the page's clock is left alone. Slowing the whole page's timeline instead
 * (DevTools' `Animation.setPlaybackRate`) puts it behind `performance.now()`,
 * from which Motion sets each animation's start: an animation then waits,
 * still, for the slowed timeline to catch up, nine times as long as the page
 * has been slowed, and still waits after the speed is set back.
 */
export async function slowAnimations(page: Page) {
  await page.evaluate(() => {
    const slowed = new WeakSet<Animation>()
    const state = { on: true }
    Object.assign(window, { slowAnimations: state })
    const slow = () => {
      if (!state.on) {
        return
      }
      for (const animation of document.getAnimations()) {
        if (!slowed.has(animation)) {
          slowed.add(animation)
          animation.updatePlaybackRate(0.1)
        }
      }
      requestAnimationFrame(slow)
    }
    slow()
  })
  return async () => {
    await page.evaluate(() => {
      const state = (window as unknown as { slowAnimations: { on: boolean } })
        .slowAnimations
      state.on = false
      for (const animation of document.getAnimations()) {
        animation.updatePlaybackRate(1)
      }
    })
  }
}
