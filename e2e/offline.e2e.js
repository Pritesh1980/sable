import { test, openDemo, expectWorksOffline } from './fixtures'

// The one test that lets the service worker run: installed on an iPhone, Sable
// has to open on the Tube. Deep links to routes never visited online included.
test.use({ serviceWorkers: 'allow' })

test('opens every main route offline once installed', async ({ page }) => {
  await openDemo(page, '/')
  await page.goto('/gallery')
  await expectWorksOffline(page, ['/gallery', '/concepts', '/brief', '/'])
})
