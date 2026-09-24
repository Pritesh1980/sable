import { test, expect, openIdeaWithPhoto, opacity, isOnTop } from './fixtures'

// Controls that appear on hover must simply be there on a phone, which has no
// hover. Tailwind v4 wraps hover: in @media (hover: hover), so a bare
// opacity-0 once left nine of them invisible yet tappable on iPhone (#49); the
// fix gates the *hiding* with can-hover:. Only a real isMobile context reports
// hover: none, so this is the one place that can prove the compiled CSS works.
// hover.desktop.e2e.js checks the other half.

test('photo controls are visible without hover, and 3D print opens over the idea', async ({ page }) => {
  expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true)
  await openIdeaWithPhoto(page)

  const remove = page.getByRole('button', { name: 'Remove photo' })
  const print = page.getByRole('button', { name: '3D print reference 1' })
  await expect.poll(() => opacity(remove)).toBe('1')
  await expect.poll(() => opacity(print)).toBe('1')

  await print.tap()
  const drawer = page.getByRole('dialog', { name: 'Make Relief STL' })
  await expect(drawer).toBeVisible()
  expect(await isOnTop(drawer.getByRole('button', { name: 'Download STL' }))).toBe(true)
  await drawer.getByRole('button', { name: 'Close' }).tap()
  await expect(drawer).toBeHidden()
  // Still editing the idea underneath.
  await expect(print).toBeVisible()
})
