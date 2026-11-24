import { test, expect, openDemo } from './fixtures'

// #187: Manage's curation hints, on the phone. Like tastemap.e2e.js, the style
// index is seeded straight into IndexedDB (a real build downloads ~90MB).
// ferrum_line gets a fourth photo borrowed from another artist, so it has one
// photo unlike the rest; and with three of the other five demo artists tagged
// realism, it is suggested realism.

const MODEL = 'Xenova/clip-vit-base-patch32'
const DEMO_IDS = ['mora.blackfern', 'vesper_noctis', 'hexen_atlas', 'ferrum_line', 'ashgrove.tattoo', 'lekhani.ink']

async function seed(page) {
  await page.evaluate(async ({ model, ids }) => {
    const artists = JSON.parse(localStorage.getItem('tattoo_artists_meta') || '[]')
    const byId = new Map(artists.map((a) => [a.id, a]))
    const borrowed = byId.get('vesper_noctis').images[0]
    // Every copy of the record (the cache and the local backend's "remote"),
    // stamped newer, so sync on the next load keeps the edit.
    const updatedAt = new Date(Date.now() + 60_000).toISOString()
    for (const key of Object.keys(localStorage).filter((k) => k.startsWith('tattoo_'))) {
      let rows
      try { rows = JSON.parse(localStorage.getItem(key)) } catch { continue }
      const ferrum = Array.isArray(rows) && rows.find((r) => r?.id === 'ferrum_line' && Array.isArray(r.images))
      if (!ferrum) continue
      ferrum.images = [...ferrum.images, borrowed]
      ferrum.updatedAt = updatedAt
      localStorage.setItem(key, JSON.stringify(rows))
    }

    const vector = (artist, image) => {
      const v = new Float32Array(512)
      v[artist * 20] = 1
      v[artist * 20 + 1 + image] = 0.2
      const length = Math.hypot(...v)
      return v.map((x) => x / length)
    }
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('tattoo-style-index-v2', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('vectors')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise((resolve, reject) => {
      const tx = db.transaction('vectors', 'readwrite')
      ids.forEach((id, artist) => {
        byId.get(id).images.slice(0, 3).forEach((src, image) => tx.objectStore('vectors')
          .put(vector(artist, image), `${model}:path:/${String(src).replace(/^\//, '')}`))
      })
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, { model: MODEL, ids: DEMO_IDS })
}

const noSideScroll = (page) => page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth)

for (const width of [440, 320]) {
  test(`suggests a tag and flags an odd photo, and Keep clears it (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 956 })
    await openDemo(page, '/')
    await seed(page)
    await page.goto('/gallery?mode=manage')

    const row = page.getByRole('row').filter({ hasText: '@ferrum_line' })
    await expect(row.getByText('1 photo to check')).toBeVisible()
    await row.getByText('@ferrum_line').tap()

    const add = page.getByRole('button', { name: 'Add the realism tag' })
    await expect(add).toBeVisible()
    await expect(page.getByText(/looks like Vesper Ash, .* tagged realism/i)).toBeVisible()
    const odd = page.getByRole('region', { name: "Doesn't look like the rest" })
    await expect(odd).toBeVisible()
    const keep = odd.getByRole('button', { name: 'Keep' })
    for (const target of [add, keep, odd.getByRole('button', { name: 'Remove' })]) {
      expect((await target.boundingBox()).height).toBeGreaterThanOrEqual(44)
    }
    expect(await noSideScroll(page)).toBe(true)
    await odd.scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath(`manage-hints-${width}.png`) })

    await keep.tap()
    await expect(odd).toHaveCount(0)
    await expect(row.getByText('1 photo to check')).toHaveCount(0)

    await add.tap()
    await expect(page.getByRole('button', { name: 'Add the realism tag' })).toHaveCount(0)
  })
}
