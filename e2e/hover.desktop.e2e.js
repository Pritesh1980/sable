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
  await openDemo(page, '/gallery')
  await page.getByRole('button', { name: 'Open Mora Vane' }).first().click()
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

// #220: the artist's name is always on the wall piece; the studio line only
// appears when the pointer is over it.
test('wall piece: name always visible, studio name only on hover', async ({ page }) => {
  await openDemo(page, '/gallery')
  // The fictional demo artists have no studio: give one a real studio id, from a
  // same-origin page with no app running (as offlinePlaceholders does), so the
  // app's own sync can't write over the edit.
  await page.goto('/manifest.json')
  await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('tattoo_local_session'))
    for (const store of ['tattoo_artists_meta', `tattoo_remote_${session.user.id}_artistsMeta`]) {
      if (localStorage.getItem(store) === null) continue
      const rows = JSON.parse(localStorage.getItem(store))
      rows.find((a) => a.id === 'vesper_noctis').studio = 'no-regrets-london'
      localStorage.setItem(store, JSON.stringify(rows))
    }
  })
  await page.goto('/gallery')
  const figure = page.locator('figure[data-artist-id="vesper_noctis"]').first()
  const name = figure.locator('figcaption span').first()
  const studio = figure.locator('figcaption small')
  await expect(studio).toHaveText('No Regrets London')
  await page.mouse.move(0, 0)
  await expect.poll(() => opacity(name)).toBe('1')
  await expect.poll(() => opacity(studio)).toBe('0')
  await figure.hover()
  await expect.poll(() => opacity(studio)).toBe('1')
  await expect.poll(() => opacity(name)).toBe('1')
})
