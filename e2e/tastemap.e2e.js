import { test, expect, openDemo, isOnTop } from './fixtures'

// The taste map needs CLIP vectors, which a real run computes on-device with
// a ~90MB model — far too slow and heavy for CI. Instead the style index is
// seeded directly in IndexedDB, in exactly the shape styleIndex.js stores:
// key `${EMBEDDING_MODEL_ID}:${image src}`, value a vector. Everything from
// there (loading, projection, layout, rendering, tapping through) is real.

const MODEL = 'Xenova/clip-vit-base-patch32'
const DEMO_IDS = ['mora.blackfern', 'vesper_noctis', 'hexen_atlas', 'ferrum_line', 'ashgrove.tattoo', 'lekhani.ink']

async function seedStyleIndex(page) {
  await page.evaluate(async ({ model, ids }) => {
    // Each artist's three images cluster around their own direction, so the
    // map has real structure to lay out. Deterministic: no Math.random.
    const vector = (artist, image) => {
      const v = new Float32Array(512)
      v[artist * 20] = 1
      v[artist * 20 + 1 + image] = 0.2
      v[(artist + 1) % ids.length * 20] = 0.3
      const length = Math.hypot(...v)
      return v.map((x) => x / length)
    }
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('tattoo-style-index-v1', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('vectors')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise((resolve, reject) => {
      const tx = db.transaction('vectors', 'readwrite')
      ids.forEach((id, artist) => {
        for (let image = 0; image < 3; image += 1) {
          tx.objectStore('vectors').put(vector(artist, image), `${model}:/images/demo/${id}/${image + 1}.svg`)
        }
      })
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, { model: MODEL, ids: DEMO_IDS })
}

test('maps every indexed artist, marks your taste, and taps through to an artist', async ({ page }) => {
  await openDemo(page, '/')
  await seedStyleIndex(page)
  await page.goto('/gallery')
  await page.getByRole('button', { name: 'Map' }).tap()

  const map = page.getByRole('dialog', { name: 'Taste map' })
  await expect(map).toBeVisible()
  const nodes = map.getByRole('button', { name: / — / })
  await expect(nodes).toHaveCount(DEMO_IDS.length)
  await expect(map.getByLabel('Your taste')).toBeVisible()
  await expect(map.getByText(/not shown/)).toHaveCount(0)

  // Every thumbnail inside the screen, and no two overlapping. Measured on the
  // fixed-size thumbnail circles: the button's width follows its label, which
  // depends on the font that happened to load.
  const circles = await nodes.evaluateAll((els) => els.map((el) => el.firstElementChild.getBoundingClientRect().toJSON()))
  const width = page.viewportSize().width
  for (const c of circles) {
    expect(c.left).toBeGreaterThanOrEqual(0)
    expect(c.right).toBeLessThanOrEqual(width)
  }
  const centre = (c) => [c.left + c.width / 2, c.top + c.height / 2]
  for (let i = 0; i < circles.length; i += 1) {
    for (let j = i + 1; j < circles.length; j += 1) {
      const [ax, ay] = centre(circles[i])
      const [bx, by] = centre(circles[j])
      expect(Math.hypot(ax - bx, ay - by)).toBeGreaterThanOrEqual(circles[i].width)
    }
  }

  const vesper = map.getByRole('button', { name: /^Vesper Ash — / })
  expect(await isOnTop(vesper)).toBe(true)
  await vesper.tap()
  await expect(map).toBeHidden()
  // ArtistDetail has no dialog role; the unit tests find it the same way.
  const detail = page.locator('.fixed.inset-0.z-50')
  await expect(detail.getByText('Vesper Ash').first()).toBeVisible()
})

test('without an index it offers to build one instead of an empty map', async ({ page }) => {
  await openDemo(page, '/gallery')
  await page.getByRole('button', { name: 'Map' }).tap()
  const map = page.getByRole('dialog', { name: 'Taste map' })
  await expect(map.getByRole('button', { name: 'Build style index' })).toBeVisible()
  await expect(map.getByRole('button', { name: / — / })).toHaveCount(0)
  await map.getByRole('button', { name: 'Close taste map' }).tap()
  await expect(map).toBeHidden()
})
