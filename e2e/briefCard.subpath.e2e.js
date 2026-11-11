import { test, expect, openBriefCardFixture } from './fixtures'

test('card ordering and crop preview work under the deployment base', async ({ page }) => {
  await openBriefCardFixture(page, { base: '/sable/' })
  await page.getByRole('button', { name: 'Make reference 5 the cover' }).click()
  await page.getByRole('button', { name: 'Preview card', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Brief card preview' })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Zoom reference 1' })).toBeVisible()
})
