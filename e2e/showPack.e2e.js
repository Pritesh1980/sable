import { test, expect, openDemo } from './fixtures'

// #209 on the phone: prepare an offline pack for a fictional show in the demo,
// go offline, reload, and open the artists, their photos and the linked ideas
// from the copies saved on this device. The service worker runs here, as it
// does once Sable is installed: it serves the app shell offline, and the pack
// store serves everything in the pack.
test.use({ serviceWorkers: 'allow' })

const noSideScroll = (page) => page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth)

async function expectTouchSized(locators) {
  for (const target of locators) {
    expect((await target.boundingBox()).height).toBeGreaterThanOrEqual(44)
  }
}

for (const width of [440, 320]) {
  test(`prepares a show pack and opens it offline after a reload (${width}px)`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 956 })
    // Pinned to Nov 2026, so the 2027 editions are the ones still to come.
    await page.clock.setFixedTime(new Date('2026-11-20T12:00:00'))
    await openDemo(page, '/conventions')

    const hero = page.locator('#convention-uk-tattoo-fest')
    await hero.getByRole('button', { name: 'Edit' }).tap()
    await hero.getByRole('button', { name: 'Mora Vane' }).tap()
    await hero.getByRole('button', { name: 'Vesper Ash' }).tap()
    await hero.getByRole('button', { name: 'Done' }).tap()

    const toggle = hero.getByRole('button', { name: /^Offline pack/ })
    await expect(toggle).toContainText(/Not prepared/i)
    await toggle.tap()
    // Who is going, and the open ideas linked to them, are chosen to start.
    await expect(hero.getByRole('button', { name: 'Mora Vane' })).toHaveAttribute('aria-pressed', 'true')
    await expect(hero.getByRole('button', { name: 'Botanical forearm study' })).toHaveAttribute('aria-pressed', 'true')
    await expect(hero.getByRole('button', { name: 'Ocean in an hourglass' })).toHaveAttribute('aria-pressed', 'true')
    await hero.getByRole('button', { name: 'Prepare pack' }).tap()
    await expect(hero.getByText(/Ready offline · checked/)).toBeVisible({ timeout: 30_000 })
    await expectTouchSized([
      hero.getByRole('button', { name: 'Open pack' }),
      hero.getByRole('button', { name: 'Refresh pack' }),
      hero.getByRole('button', { name: 'Check again' }),
      hero.getByRole('button', { name: 'Remove pack' }),
      hero.getByRole('button', { name: 'Mora Vane' }),
    ])
    expect(await noSideScroll(page)).toBe(true)
    await toggle.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await page.screenshot({ path: test.info().outputPath(`show-pack-${width}.png`) })

    // Every photo tile the pack should draw: both artists' photos, then one
    // reference photo on each linked idea.
    const expected = await page.evaluate(() => {
      const artists = JSON.parse(localStorage.getItem('tattoo_artists_meta') || '[]')
      const photos = artists.filter((a) => ['mora.blackfern', 'vesper_noctis'].includes(a.id)).flatMap((a) => a.images || [])
      return photos.length + 2
    })
    expect(expected).toBeGreaterThan(2)

    // Offline, from a cold reload, as at a venue with no signal.
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15_000 }).toBe(true)
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.context().setOffline(true)
    try {
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Convention Radar' })).toBeVisible()
      await toggle.tap()
      await expect(hero.getByText(/Ready offline · checked/)).toBeVisible()
      await hero.getByRole('button', { name: 'Open pack' }).tap()

      const dialog = page.getByRole('dialog', { name: /UK Tattoo Fest 2027/ })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('heading', { name: 'Mora Vane' })).toBeVisible()
      await expect(dialog.getByRole('heading', { name: 'Vesper Ash' })).toBeVisible()
      await expect(dialog.getByRole('heading', { name: 'Botanical forearm study' })).toBeVisible()
      await expect(dialog.getByRole('heading', { name: 'Ocean in an hourglass' })).toBeVisible()
      await expect(dialog.getByText(/A fern unfolding along the forearm/)).toBeVisible()
      await expect(dialog.getByText('Ready offline', { exact: false }).first()).toBeVisible()
      // Each one drawn from the copy in the pack store, not the network.
      await expect.poll(() => dialog.locator('img').evaluateAll((imgs) =>
        imgs.filter((img) => img.src.startsWith('blob:') && img.complete && img.naturalWidth > 0).length
      ), { timeout: 15_000 }).toBe(expected)
      await expect(dialog.getByText('Not on this phone')).toHaveCount(0)
      expect(await noSideScroll(page)).toBe(true)
      await page.screenshot({ path: test.info().outputPath(`show-pack-viewer-${width}.png`) })

      // A photo opens full size, and closes back to the pack.
      await dialog.getByRole('button', { name: 'Open Mora Vane, photo 1' }).tap()
      const photo = page.getByRole('dialog', { name: 'Mora Vane, photo 1' })
      await expect(photo.getByRole('img')).toBeVisible()
      await expect.poll(() => photo.getByRole('img').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0)
      await page.screenshot({ path: test.info().outputPath(`show-pack-photo-${width}.png`) })
      await photo.getByRole('button', { name: 'Close' }).tap()
      await expect(photo).toHaveCount(0)
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Close offline pack' }).tap()
      await expect(dialog).toHaveCount(0)
    } finally {
      await page.context().setOffline(false)
    }
  })
}
