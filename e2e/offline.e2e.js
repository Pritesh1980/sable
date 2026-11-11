import { test, expect, openDemo, expectWorksOffline } from './fixtures'

// The one test that lets the service worker run: installed on an iPhone, Sable
// has to open on the Tube. Deep links to routes never visited online included.
test.use({ serviceWorkers: 'allow' })

test('opens every main route offline once installed', async ({ page }) => {
  await openDemo(page, '/')
  await page.goto('/gallery')
  await expectWorksOffline(page, ['/gallery', '/concepts', '/brief', '/'])
})

// View on arm in 3D (#195) loads its arm from public/models/, which the build
// output's precache list skipped: offline the drawer had nothing to draw on.
test('the 3D arm is there offline', async ({ page }) => {
  await openDemo(page, '/concepts')
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15_000 }).toBe(true)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.context().setOffline(true)
  try {
    const sizes = await page.evaluate(async () => {
      const base = new URL(navigator.serviceWorker.controller.scriptURL).pathname.replace(/sw\.js$/, '')
      return Promise.all(['models/arm-upper.glb', 'models/arm-upper.json'].map(async (path) => {
        try {
          const response = await fetch(new URL(path, location.origin + base))
          return response.ok ? (await response.arrayBuffer()).byteLength : 0
        } catch { return 0 }
      }))
    })
    expect(sizes.every((n) => n > 0)).toBe(true)
  } finally {
    await page.context().setOffline(false)
  }
})
