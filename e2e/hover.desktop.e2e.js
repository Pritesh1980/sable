import { test, expect, openDemo, openIdeaWithPhoto, opacity } from './fixtures'

// Desktop half of hover.e2e.js, plus the keyboard paths a phone never uses.

test('photo controls stay hidden until the pointer is over the photo', async ({ page }) => {
  expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(true)
  await openIdeaWithPhoto(page)

  const remove = page.getByRole('button', { name: 'Remove photo' })
  await page.mouse.move(0, 0)
  await expect.poll(() => opacity(remove)).toBe('0')
  await remove.hover()
  await expect.poll(() => opacity(remove)).toBe('1')
})

test('wall viewer: arrow keys step through images, Escape closes', async ({ page }) => {
  await openDemo(page, '/')
  await page.getByRole('figure', { name: 'Mora Vane' }).first().click()
  const viewer = page.getByRole('dialog', { name: / — image \d+ of \d+$/ })
  await expect(viewer).toBeVisible()
  const first = await viewer.getAttribute('aria-label')

  await page.keyboard.press('ArrowRight')
  await expect(viewer).not.toHaveAttribute('aria-label', first)
  await page.keyboard.press('ArrowLeft')
  await expect(viewer).toHaveAttribute('aria-label', first)

  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
})
