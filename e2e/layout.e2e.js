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

const WIDTHS = [320, 375, 390, 414]

test('a returning demo resets to six favourites without resurrecting extra entries', async ({ page }) => {
  await openDemo(page, '/')
  await page.evaluate(() => {
    const userId = JSON.parse(localStorage.getItem('tattoo_local_session')).user.id
    const rows = [...JSON.parse(localStorage.getItem('tattoo_artists_meta')),
      { id: 'extra-demo-artist', handle: 'extra-demo-artist', rank: 7, images: [] }]
    for (const key of ['tattoo_artists_meta', `tattoo_remote_${userId}_artistsMeta`]) localStorage.setItem(key, JSON.stringify(rows))
    localStorage.setItem('tattoo_demo_seed_version', '4')
  })
  for (let pass = 0; pass < 2; pass += 1) {
    await page.reload()
    await expect(page.getByRole('main').getByRole('button', { name: 'Open Vesper Ash' }).first()).toBeVisible()
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tattoo_artists_meta')).map((artist) => artist.id))).toEqual([
      'vesper_noctis', 'ashgrove.tattoo', 'hexen_atlas', 'lekhani.ink', 'mora.blackfern', 'ferrum_line',
    ])
  }
})

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

    test('wall controls fit without colliding', async ({ page }) => {
      await openDemo(page, '/')
      await settle(page)
      const header = page.locator('header').first()
      const tabs = header.locator('nav button')
      const add = header.getByRole('button', { name: /add artist/i })
      const menu = header.getByRole('button', { name: /everything else/i })
      const controls = [tabs.nth(0), tabs.nth(1), add, menu]
      const bounds = await Promise.all(controls.map((control) => control.boundingBox()))
      for (const box of bounds) {
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
      for (let i = 0; i < bounds.length; i += 1) {
        for (let j = i + 1; j < bounds.length; j += 1) {
          const a = bounds[i], b = bounds[j]
          expect(a.x + a.width <= b.x || b.x + b.width <= a.x ||
            a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true)
        }
      }
      await add.click()
      await expect(page.getByRole('dialog', { name: 'Add an artist' })).toBeVisible()
    })

    test('gallery labels fit in one continuous two-column phone grid', async ({ page }) => {
      await openDemo(page, '/gallery')
      await page.getByRole('button', { name: 'Grid view', exact: true }).click()
      await settle(page)
      const cards = page.getByRole('button', { name: 'Vesper Ash', exact: true }).locator('..')
      const first = await cards.boundingBox()
      expect(first.width).toBeGreaterThan(width * 0.4)
      const third = await page.getByRole('button', { name: '@hexen_atlas', exact: true }).locator('..').boundingBox()
      const fourth = await page.getByRole('button', { name: 'Asha Lekhani', exact: true }).locator('..').boundingBox()
      expect(Math.abs(third.y - fourth.y)).toBeLessThan(2)
      await cards.locator('p').nth(0).evaluate((label) => { label.textContent = 'An Exceptionally Long Artist Name' })
      await cards.locator('p').nth(1).evaluate((label) => { label.textContent = '@an.exceptionally.long.handle' })
      expect(await cards.locator('p').evaluateAll((labels) => labels.every((label) => {
        const box = label.getBoundingClientRect()
        const card = label.closest('[role="presentation"]').getBoundingClientRect()
        return label.scrollWidth <= label.clientWidth + 1 && box.left >= card.left && box.right <= card.right
          && box.top >= card.top && box.bottom <= card.bottom
      }))).toBe(true)
    })

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

// #155: the route check above runs with every artist index closed. Opening
// one made the convention cards' single implicit grid column size itself to
// the widest row, so the page panned sideways and the Add buttons sat
// off-screen (561px on a 390px phone).
test('an open artist index keeps Radar within the screen', async ({ page }) => {
  await openDemo(page, '/conventions')
  await settle(page)
  const width = page.viewportSize().width
  const card = page.locator('#convention-big-london')
  await card.getByRole('button', { name: /artist index/i }).click()
  const failures = []
  for (const view of ['All', 'New to you']) {
    await card.getByRole('button', { name: view, exact: true }).click()
    await expect(card.getByRole('button', { name: /^add$/i }).first()).toBeVisible()
    const { scrollWidth, culprits } = await overflow(page)
    if (scrollWidth > width) failures.push(`${view}: ${scrollWidth}px\n    ${culprits.join('\n    ')}`)
    const add = await card.getByRole('button', { name: /^add$/i }).first().boundingBox()
    if (add.x + add.width > width) failures.push(`${view}: first Add ends at ${Math.round(add.x + add.width)}px`)
  }
  expect(failures, failures.join('\n')).toEqual([])
})
