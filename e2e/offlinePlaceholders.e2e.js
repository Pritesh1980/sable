import { test, expect, openDemo, DEMO_CONCEPT, SECOND_CONCEPT } from './fixtures'

// #102. A blob key the local backend has no bytes for resolves to nothing,
// exactly as an unreachable photo does offline on a network backend.
const MISSING = 'user/e2e/missing/photo.jpg'
const OFFLINE_CONCEPT = { ...SECOND_CONCEPT, id: 'e2e-offline', prompt: 'Offline moth', imageUrl: MISSING, variants: [] }
const offlineTile = (scope) => scope.getByRole('img', { name: 'Photo available when online' })

test('an artist photo that cannot load keeps its place as a tile', async ({ page }) => {
  await page.goto('/?demo=1')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('tattoo_local_session'))).not.toBeNull()
  // Edit the stored artists from a same-origin page with no app running, so
  // the demo page's own sync can't write over the edit. Both the offline cache
  // and the local backend's remote copy get the photo; the remote key is
  // namespaced per user, so match it rather than hard-coding it.
  await page.goto('/manifest.json')
  const patched = await page.evaluate((key) => {
    localStorage.setItem('tattoo_demo_intro_dismissed', '1')
    const stores = Object.keys(localStorage).filter((k) => k === 'tattoo_artists_meta' || /^tattoo_remote_.*artistsMeta$/.test(k))
    for (const store of stores) {
      const rows = JSON.parse(localStorage.getItem(store))
      const vesper = rows.find((a) => a.id === 'vesper_noctis')
      vesper.images = [...vesper.images.slice(0, 1), { key }, ...vesper.images.slice(1)]
      localStorage.setItem(store, JSON.stringify(rows))
    }
    return stores.length
  }, MISSING)
  expect(patched).toBe(2)
  await page.goto('/gallery')
  // The detail sheet snapshots its photos when it opens, so open it only once
  // the gallery has hydrated (real photos rendered, not monograms).
  await expect(page.locator('img[src*="vesper_noctis/"]').first()).toBeAttached()
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
