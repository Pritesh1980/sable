import { test, expect, openDemo, isOnTop } from './fixtures'

// Search by words (#186). The real text model is a 67 MB download, far too heavy
// for CI, so huggingface.co is blocked and the style index is seeded in
// IndexedDB in the shape styleIndex.js stores: photo vectors under
// `${MODEL}:path:/<src>`, and one search phrase under `${MODEL}:text:<phrase>`,
// exactly as a search that already ran on this device leaves it. Everything
// from there (reading the index, ranking, grouping, opening the viewer, Back) is real.

const MODEL = 'Xenova/clip-vit-base-patch32'
const DEMO_IDS = ['mora.blackfern', 'vesper_noctis', 'hexen_atlas', 'ferrum_line', 'ashgrove.tattoo', 'lekhani.ink']

async function seedIndex(page) {
  await page.evaluate(async ({ model, ids }) => {
    // Each artist's photos point their own way; "skull" points at the first
    // artist's, and brushes the last artist's (0.3 along it), so two artists match.
    const unit = (v) => v.map((x) => x / Math.hypot(...v))
    const photo = (artist, image) => {
      const v = new Array(512).fill(0)
      v[artist * 20] = 1
      v[artist * 20 + 1 + image] = 0.2
      v[((artist + 1) % ids.length) * 20] = 0.3
      return unit(v)
    }
    const skull = unit(Array.from({ length: 512 }, (_, i) => (i === 0 ? 1 : 0)))
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('tattoo-style-index-v2', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('vectors')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const artists = JSON.parse(localStorage.getItem('tattoo_artists_meta') || '[]')
    const imagesById = new Map(artists.map((artist) => [artist.id, artist.images]))
    await new Promise((resolve, reject) => {
      const tx = db.transaction('vectors', 'readwrite')
      const store = tx.objectStore('vectors')
      ids.forEach((id, artist) => {
        imagesById.get(id).forEach((src, image) => store.put(photo(artist, image), `${model}:path:/${String(src).replace(/^\//, '')}`))
      })
      store.put(skull, `${model}:text:skull`)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, { model: MODEL, ids: DEMO_IDS })
}

async function openSearch(page) {
  await page.getByRole('button', { name: 'Tools' }).tap()
  await page.getByRole('menuitem', { name: 'Search' }).tap()
  return page.getByRole('dialog', { name: 'Search your photos' })
}

test.beforeEach(async ({ page }) => {
  await page.route(/huggingface\.co/, (route) => route.abort())
})

test('finds photos by a word, opens one over the results, and Back returns to them', async ({ page }) => {
  await openDemo(page, '/')
  await seedIndex(page)
  await page.goto('/gallery')
  const sheet = await openSearch(page)
  await expect(sheet.getByText(/^Searching \d+ of \d+ photos$/)).toBeVisible()

  const box = sheet.getByRole('searchbox', { name: 'Search your photos' })
  await box.fill('Skull')
  await box.press('Enter')

  // Two artists match: the first is the closer one, with all three photos.
  const groups = sheet.getByRole('heading', { level: 3 })
  await expect(groups).toHaveCount(2)
  const first = (await groups.first().textContent()).trim()
  await expect(sheet.locator('section').first().getByRole('button')).toHaveCount(3)
  await expect(page).toHaveURL(/[?&]search=skull/)

  // Nothing overflows sideways at phone width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  await sheet.getByRole('button', { name: new RegExp(`^Open photo 1 by ${first}$`, 'i') }).tap()
  const viewer = page.getByRole('dialog', { name: /— image/ })
  await expect(viewer).toBeVisible()
  expect(await isOnTop(viewer.getByTestId('viewer-surface'))).toBe(true)
  await expect(viewer).toHaveAttribute('aria-label', new RegExp(`^${first} — image`, 'i'))

  // Escape closes the photo, not the search under it.
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
  await expect(sheet).toBeVisible()
  await expect(page).toHaveURL(/[?&]search=skull/)

  // So does Back.
  await sheet.getByRole('button', { name: new RegExp(`^Open photo 1 by ${first}$`, 'i') }).tap()
  await expect(viewer).toBeVisible()
  await page.goBack()
  await expect(viewer).toBeHidden()
  await expect(sheet.getByRole('heading', { level: 3 })).toHaveCount(2)
  expect(await isOnTop(sheet.getByRole('searchbox'))).toBe(true)

  // A reload restores the results from the kept phrase; the model stays blocked.
  await page.reload()
  await expect(sheet.getByRole('heading', { level: 3 })).toHaveCount(2)

  await sheet.getByRole('button', { name: 'Close search' }).tap()
  await expect(sheet).toBeHidden()
})

test('says so when the search model cannot be downloaded', async ({ page }) => {
  await openDemo(page, '/')
  await seedIndex(page)
  await page.goto('/gallery')
  const sheet = await openSearch(page)
  const box = sheet.getByRole('searchbox', { name: 'Search your photos' })
  await box.fill('wolf')
  await box.press('Enter')
  await expect(sheet.getByRole('alert')).toHaveText('Could not load the search model. Check your connection and try again.')
})

test('without an index it offers to build one', async ({ page }) => {
  await openDemo(page, '/gallery')
  const sheet = await openSearch(page)
  await expect(sheet.getByRole('button', { name: 'Build style index' })).toBeVisible()
  await expect(sheet.getByRole('searchbox')).toHaveCount(0)
})
