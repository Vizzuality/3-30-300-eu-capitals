import { expect, test } from "@playwright/test"

test("a capital is named in the page's language", async ({ page }) => {
  await page.goto("/en/capitals/stockholm")
  await expect(
    page.getByRole("heading", { level: 1, name: "Stockholm" })
  ).toBeVisible()
  await expect(page).toHaveTitle(/^Stockholm: /)

  // The language list comes later: the language is changed in the address
  await page.evaluate(() =>
    window.history.pushState({}, "", "/fi/capitals/stockholm")
  )
  await expect(
    page.getByRole("heading", { level: 1, name: "Tukholma" })
  ).toBeVisible()
  await expect(page).toHaveTitle(/^Tukholma: /)

  // Opened directly, as search engines see it
  await page.goto("/el/capitals/stockholm")
  await expect(
    page.getByRole("heading", { level: 1, name: "Στοκχόλμη" })
  ).toBeVisible()
  await expect(page).toHaveTitle(/^Στοκχόλμη: /)
})
