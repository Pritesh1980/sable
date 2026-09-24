import { test, expect, expectWorksOffline } from './fixtures'

// What a visitor to the public demo actually gets: the deployed build behind
// Pages' CDN, with its real service worker. Paths are relative on purpose —
// resolved against baseURL (…/sable/), where '/gallery' would escape the base.
// Keep this short and read-only: it runs against production, not a fixture.

const ROUTES = ['', 'gallery', 'brief', 'conventions', 'studios', 'concepts', 'settings', 'help']

test.beforeEach(async ({ page }) => {
  await page.goto('?demo=1')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('tattoo_local_session'))).not.toBeNull()
  await page.evaluate(() => localStorage.setItem('tattoo_demo_intro_dismissed', '1'))
})

test('every route deep-links and renders, with no broken same-origin requests', async ({ page, baseURL }) => {
  const origin = new URL(baseURL).origin
  const broken = []
  page.on('response', (response) => {
    // Pages answers every deep link with 404.html (a copy of index.html, see
    // deploy-pages.yml) and a 404 status, so documents are judged by what
    // renders, not their status. Scripts, styles, images and data must be 2xx.
    if (response.request().resourceType() === 'document') return
    if (response.url().startsWith(origin) && response.status() >= 400) broken.push(`${response.status()} ${response.url()}`)
  })
  for (const route of ROUTES) {
    await page.goto(route)
    await expect(page.locator('#root')).not.toBeEmpty()
    await expect(page.getByRole('link', { name: 'Artists' }).or(page.getByRole('button', { name: 'Artists' })).first()).toBeVisible()
  }
  expect(broken).toEqual([])
})

test('demo artist images load from the deployed base', async ({ page }) => {
  await page.goto('gallery')
  await page.waitForLoadState('networkidle')
  const images = await page.locator('img[src*="images/demo/"]').evaluateAll((els) =>
    els.map((img) => ({ src: img.src, loaded: img.complete && img.naturalWidth > 0 })))
  expect(images.length).toBeGreaterThan(0)
  for (const image of images) expect(image.loaded, image.src).toBe(true)
})

test('the manifest is served and still offers share-to-Sable', async ({ request }) => {
  const response = await request.get('manifest.json')
  expect(response.ok()).toBe(true)
  const manifest = await response.json()
  expect(manifest.share_target).toBeTruthy()
})

test('the installed app opens offline', async ({ page }) => {
  await page.goto('gallery')
  await page.waitForLoadState('networkidle')
  await expectWorksOffline(page, ['', 'gallery', 'brief'])
})
