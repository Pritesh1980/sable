import { test, expect, openDemo, DEMO_CONCEPT } from './fixtures'

// No page may be wider than the phone it's on. A single overflowing row lets
// the whole page pan sideways on iPhone, and jsdom can't see it (no layout),
// so this is the only guard. Found twice by hand before this suite existed:
// Concepts at 444px and Gallery at 438px on a 390px screen (#96).

const ROUTES = [
  '/',
  '/pipeline',
  '/gallery',
  '/gallery?mode=manage',
  '/brief',
  '/brief?tab=boards',
  '/conventions',
  '/studios',
  '/concepts',
  '/settings',
  '/help',
]

const WIDTHS = [320, 375, 390]

// Wider than the viewport, reported with the elements that poke out so a
// failure names its culprit instead of just a number.
async function overflow(page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const culprits = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.right > width + 1
      })
      // Keep the outermost offenders; their children are just along for the ride.
      .filter((el, _, all) => !all.some((other) => other !== el && other.contains(el)))
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)} → ${Math.round(el.getBoundingClientRect().right)}px`)
    return { width, scrollWidth: document.documentElement.scrollWidth, culprits }
  })
}

async function settle(page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('#root')).not.toBeEmpty()
}

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } })

    test('no route is wider than the screen', async ({ page }) => {
      await openDemo(page, '/', { concepts: [DEMO_CONCEPT] })
      const failures = []
      for (const route of ROUTES) {
        await page.goto(route)
        await settle(page)
        const { scrollWidth, culprits } = await overflow(page)
        if (scrollWidth > width) failures.push(`${route}: ${scrollWidth}px\n    ${culprits.join('\n    ')}`)
      }
      expect(failures, failures.join('\n')).toEqual([])
    })

    test('every gallery view fits the screen', async ({ page }) => {
      await openDemo(page, '/gallery')
      await settle(page)
      const failures = []
      for (const view of ['Filmstrip view', 'Compare artists', 'Grid view', 'Style wall']) {
        await page.getByRole('button', { name: view }).click()
        await page.waitForLoadState('networkidle')
        const { scrollWidth, culprits } = await overflow(page)
        if (scrollWidth > width) failures.push(`${view}: ${scrollWidth}px\n    ${culprits.join('\n    ')}`)
      }
      expect(failures, failures.join('\n')).toEqual([])
    })
  })
}
