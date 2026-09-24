import { test, expect, expectWorksOffline } from './fixtures'

// The public demo lives at /sable/ on GitHub Pages. Every path here is
// relative on purpose: Playwright resolves it against baseURL, so 'gallery'
// means /sable/gallery, whereas '/gallery' would escape the base entirely.

const ROUTES = ['', 'pipeline', 'gallery', 'brief', 'conventions', 'studios', 'concepts', 'settings', 'help']

test.beforeEach(async ({ page }) => {
  await page.goto('?demo=1')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('tattoo_local_session'))).not.toBeNull()
  await page.evaluate(() => localStorage.setItem('tattoo_demo_intro_dismissed', '1'))
})

test('every route deep-links under the base, with no broken assets', async ({ page }) => {
  const broken = []
  page.on('response', (response) => {
    const url = new URL(response.url())
    if (url.hostname === 'localhost' && response.status() >= 400) broken.push(`${response.status()} ${url.pathname}`)
  })
  for (const route of ROUTES) {
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('#root')).not.toBeEmpty()
    expect(new URL(page.url()).pathname).toBe(`/sable/${route}`)
  }
  expect(broken).toEqual([])
})

test('stored image paths are based at display time and actually load', async ({ page }) => {
  await page.goto('gallery')
  await page.waitForLoadState('networkidle')
  const images = await page.locator('img[src*="images/demo/"]').evaluateAll((els) =>
    els.map((img) => ({ src: new URL(img.src).pathname, loaded: img.complete && img.naturalWidth > 0 })))
  expect(images.length).toBeGreaterThan(0)
  for (const image of images) {
    expect(image.src.startsWith('/sable/images/demo/'), image.src).toBe(true)
    expect(image.loaded, image.src).toBe(true)
  }
})

test('legacy routes redirect within the base', async ({ page }) => {
  await page.goto('manage')
  await expect(page).toHaveURL(/\/sable\/gallery\?mode=manage$/)
  await page.goto('boards')
  await expect(page).toHaveURL(/\/sable\/brief\?tab=boards$/)
})

test('in-app navigation keeps the base', async ({ page }) => {
  await page.goto('help')
  await page.getByRole('link', { name: 'Artists' }).tap()
  await expect(page).toHaveURL(/\/sable\/gallery$/)
})

test('the manifest starts the installed app inside the base', async ({ page, request }) => {
  await page.goto('')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  const manifestUrl = new URL(href, page.url())
  const manifest = await (await request.get(manifestUrl.href)).json()
  expect(new URL(manifest.start_url, manifestUrl).pathname.startsWith('/sable/')).toBe(true)
  expect(new URL(manifest.scope || '.', manifestUrl).pathname.startsWith('/sable/')).toBe(true)
})

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' })

  // The worker derives its base from its own URL; this is the public demo's
  // real configuration, so offline is proven where it is actually served.
  test('opens offline under the base once installed', async ({ page }) => {
    await page.goto('gallery')
    await expectWorksOffline(page, ['gallery', 'concepts', 'brief'])
  })
})
