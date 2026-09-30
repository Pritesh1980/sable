import { test, expect, openDemo, DEMO_CONCEPT, SECOND_CONCEPT } from './fixtures'

// #102. A blob key the local backend has no bytes for resolves to nothing,
// exactly as an unreachable photo does offline on a network backend.
const MISSING = 'user/e2e/missing/photo.jpg'
const OFFLINE_CONCEPT = { ...SECOND_CONCEPT, id: 'e2e-offline', prompt: 'Offline moth', imageUrl: MISSING, variants: [] }
const offlineTile = (scope) => scope.getByRole('img', { name: 'Photo available when online' })

test('an artist photo that cannot load keeps its place as a tile', async ({ page }) => {
  await page.goto('/?demo=1')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('tattoo_local_session'))).not.toBeNull()
  await page.evaluate((key) => {
    localStorage.setItem('tattoo_demo_intro_dismissed', '1')
    for (const store of ['tattoo_artists_meta', 'tattoo_remote_artistsMeta']) {
      const rows = JSON.parse(localStorage.getItem(store) || '[]')
      const vesper = rows.find((a) => a.name === 'Vesper Ash')
      if (vesper) vesper.images = [...vesper.images.slice(0, 1), { key }, ...vesper.images.slice(1)]
      localStorage.setItem(store, JSON.stringify(rows))
    }
  }, MISSING)
  await page.goto('/gallery')
  await page.getByText('Vesper Ash').first().tap()

  const detail = page.locator('.fixed.inset-0.z-50')
  const tile = offlineTile(detail)
  await expect(tile).toBeVisible()
  await tile.scrollIntoViewIfNeeded()
  const box = await tile.boundingBox()
  expect(box.width).toBeGreaterThan(200)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width)
  await page.screenshot({ path: test.info().outputPath('artist-offline.png') })
})

test('a concept whose image cannot load stays on the wall and does not open', async ({ page }) => {
  await openDemo(page, '/concepts', { concepts: [DEMO_CONCEPT, OFFLINE_CONCEPT] })

  await expect(offlineTile(page)).toBeVisible()
  await expect(page.getByText('Drafts — awaiting an image')).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('concepts-offline.png') })

  await offlineTile(page).tap()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // The viewer still opens the concept that can load, and has only that one.
  await page.getByRole('img', { name: /moth over a crescent moon/i }).first().tap()
  await expect(page.getByRole('dialog').first()).toBeVisible()
})
