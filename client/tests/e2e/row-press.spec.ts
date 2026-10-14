import { expect, test, type Locator, type Page } from "@playwright/test"

/*
 * A pressed row of a list of capitals squashes like a button, with its
 * highlight background: while the press is held (the button down, never
 * released), the row and its highlight box cover the same box. Checked in
 * the ranking, the A–Z list and Other capitals, pressed with a mouse, so on
 * desktop only.
 */

test.skip(({ isMobile }) => isMobile, "Pressed with a mouse")

async function hydrated(page: Page) {
  await expect(page.locator("[data-map-area]")).toHaveAttribute(
    "data-instance",
    /.+/
  )
}

/** The vertical scale an element is drawn at, from its transform */
const drawnHeight = (element: Element) =>
  new DOMMatrixReadOnly(getComputedStyle(element).transform).d

/** The row and its list's highlight box, as drawn */
const boxes = (row: Locator) =>
  row.evaluate((element) => {
    const highlight = element
      .closest("ol, ul")
      ?.parentElement?.querySelector("[data-slot='row-highlight']")
    const rowBox = element.getBoundingClientRect()
    const highlightBox = highlight?.getBoundingClientRect()
    return {
      row: [rowBox.left, rowBox.top, rowBox.right, rowBox.bottom],
      highlight: highlightBox && [
        highlightBox.left,
        highlightBox.top,
        highlightBox.right,
        highlightBox.bottom,
      ],
    }
  })

async function expectSquashedTogether(page: Page, row: Locator) {
  await row.scrollIntoViewIfNeeded()
  await row.hover()
  // The highlight has come to the row
  await expect
    .poll(async () => {
      const { row: rowBox, highlight } = await boxes(row)
      return rowBox && highlight && Math.abs(rowBox[1] - highlight[1]) < 0.5
    })
    .toBe(true)

  await page.mouse.down()
  // Once the row has reached its squash
  await expect.poll(() => row.evaluate(drawnHeight)).toBeLessThan(0.9401)

  const { row: rowBox, highlight } = await boxes(row)
  if (!rowBox || !highlight) {
    throw new Error("The row or its highlight is not on screen")
  }
  for (const [index, edge] of rowBox.entries()) {
    expect(Math.abs(edge - highlight[index])).toBeLessThan(0.5)
  }

  // Let go away from the row, so that it does not open
  await page.mouse.move(0, 0)
  await page.mouse.up()
}

test(
  "a pressed ranking row squashes with its background",
  { tag: "@motion" },
  async ({ page }) => {
    await page.goto("/en")
    await hydrated(page)

    await expectSquashedTogether(
      page,
      page.getByRole("link", { name: /^Berlin, rank 2:/ })
    )
  }
)

test(
  "a pressed A–Z row squashes with its background",
  { tag: "@motion" },
  async ({ page }) => {
    await page.goto("/en?tab=az")
    await hydrated(page)

    await expectSquashedTogether(
      page,
      page.getByRole("link", { name: "Athens, Greece" })
    )
  }
)

test(
  "a pressed row of Other capitals squashes with its background",
  { tag: "@motion" },
  async ({ page }) => {
    await page.goto("/en/capitals/stockholm")
    await hydrated(page)

    await expectSquashedTogether(
      page,
      page.getByRole("link", { name: /^Paris, rank 16:/ })
    )
  }
)
