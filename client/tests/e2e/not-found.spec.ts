import { expect, test } from "@playwright/test"

for (const [address, path] of [
  ["an unknown page", "/en/no-such-page"],
  ["an unknown capital", "/en/capitals/atlantis"],
  ["an unknown language", "/xx/about"],
]) {
  test(`${address} shows the 404 page`, async ({ page }) => {
    const response = await page.goto(path)

    expect(response?.status()).toBe(404)
    await expect(
      page.getByRole("heading", { level: 1, name: "Page not found" })
    ).toBeVisible()
    await expect(page).toHaveTitle("Page not found · 3-30-300")

    await page.getByRole("link", { name: "Go to the home page" }).click()
    await expect(page).toHaveURL("/en")
  })
}
