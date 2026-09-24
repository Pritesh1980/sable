import { test as base, expect } from '@playwright/test'

// Shared setup for the browser suite. Every test starts from the fictional
// ?demo=1 dataset on the local backend (see src/data/demoSeed.js), so nothing
// here can reach a real account.
//
// Google Fonts are deliberately left live, not stubbed: the layout checks must
// measure the typeface a phone actually renders, and a fallback font would be
// measuring a different page.

// A finished concept whose image is a committed demo SVG. Static paths are not
// blob keys, so the concepts codec displays them as-is.
export const DEMO_CONCEPT = {
  id: 'e2e-concept-1',
  prompt: 'Moth over a crescent moon',
  imageUrl: '/images/demo/vesper_noctis/1.svg',
  response: '',
  tags: ['dark-fantasy'],
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  // A saved result: the 3D print and try-on actions hang off results.
  variants: [
    {
      id: 'e2e-variant-1',
      title: 'Moth line study',
      imageUrl: '/images/demo/vesper_noctis/1.svg',
      provider: 'chatgpt',
      isBest: true,
      createdAt: '2026-09-01T10:05:00.000Z',
    },
  ],
}

export const SECOND_CONCEPT = {
  ...DEMO_CONCEPT,
  id: 'e2e-concept-2',
  prompt: 'Fern spiral with seed heads',
  imageUrl: '/images/demo/mora.blackfern/1.svg',
  tags: ['fine-line'],
  createdAt: '2026-09-02T10:00:00.000Z',
  variants: [],
}

// Boot the demo, then layer extra localStorage on top before visiting `path`.
// Seeding writes the session on first load, so the extras go in afterwards
// and the target page reads them on a clean boot.
export async function openDemo(page, path = '/', { concepts, storage = {} } = {}) {
  await page.goto('/?demo=1')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('tattoo_local_session'))).not.toBeNull()
  await page.evaluate(({ concepts, storage }) => {
    localStorage.setItem('tattoo_demo_intro_dismissed', '1')
    if (concepts) {
      localStorage.setItem('tattoo_concepts', JSON.stringify(concepts))
      localStorage.setItem('tattoo_remote_concepts', JSON.stringify(concepts))
    }
    for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value)
  }, { concepts, storage })
  await page.goto(path)
}

// Real touch input through the DevTools protocol. Playwright's touchscreen
// only taps; swipes and pinches need raw touch points, which Chromium turns
// into the same pointer events (pointerType 'touch') an iPhone produces. One
// session per gesture: a session tracks the touch in progress, so a fresh one
// mid-gesture rejects the move ("Must send a TouchStart first").
async function gesture(page, start, end, steps) {
  const cdp = await page.context().newCDPSession(page)
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map(([x, y], id) => ({ x, y, id })),
  })
  try {
    await send('touchStart', start)
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps
      await send('touchMove', start.map(([x, y], k) => [x + (end[k][0] - x) * t, y + (end[k][1] - y) * t]))
    }
    await send('touchEnd', [])
  } finally {
    await cdp.detach()
  }
}

// One finger from `from` to `to` in small steps, like a real flick.
export const swipe = (page, from, to, steps = 8) => gesture(page, [from], [to], steps)

// Two fingers moving from `start` to `end` pairs — a pinch, spread or twist.
export const twoFinger = (page, start, end, steps = 8) => gesture(page, start, end, steps)

// The centre of the viewport, where a full-screen viewer's image sits.
export function centre(page) {
  const { width, height } = page.viewportSize()
  return [width / 2, height / 2]
}

// Is `locator` the thing actually painted on top at its own centre? A drawer
// that renders *under* a z-[60] viewer is present, visible and clickable to
// Playwright's actionability checks in some layouts, yet a real finger lands
// on the viewer. elementFromPoint is what the finger sees.
export async function isOnTop(locator) {
  await locator.scrollIntoViewIfNeeded()
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 200))
    return el.contains(hit)
  })
}

// From the Concepts wall to DEMO_CONCEPT's saved result, expanded so its
// Make STL / Try on skin actions show: viewer → controls → results → expand.
export async function openResult(page) {
  await page.getByRole('figure', { name: /Moth over/ }).click()
  await page.touchscreen.tap(...centre(page))
  await page.getByRole('button', { name: 'Variants & STL export' }).tap()
  await page.getByRole('button', { name: /^Expand Moth line study/ }).tap()
}

// Brief → the demo idea that has a reference photo, open in the idea editor.
export async function openIdeaWithPhoto(page) {
  await openDemo(page, '/brief')
  await page.getByText('Night forest half-sleeve').first().click()
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeAttached()
}

export const opacity = (locator) => locator.evaluate((el) => getComputedStyle(el).opacity)

// The installed app must start with no network: the service worker serves the
// cached shell for any route and cached assets for the rest. Call from a test
// that allows service workers (the config blocks them by default, so a stale
// cache can't mask a change). `routes` are relative to the page's base URL.
export async function expectWorksOffline(page, routes) {
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
    message: 'service worker never took control',
    timeout: 15_000,
  }).toBe(true)
  // The worker precaches the build on install; wait until it has finished.
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.context().setOffline(true)
  try {
    for (const route of routes) {
      await page.goto(route)
      await expect(page.locator('#root')).not.toBeEmpty()
      await expect(page.getByRole('link', { name: 'Artists' }).or(page.getByRole('button', { name: 'Artists' })).first()).toBeVisible()
    }
    // Images seen online come back from the cache too.
    const broken = await page.locator('img[src*="images/demo/"]').evaluateAll((els) =>
      els.filter((img) => !(img.complete && img.naturalWidth > 0)).map((img) => img.src))
    expect(broken).toEqual([])
  } finally {
    await page.context().setOffline(false)
  }
}

// Fail the test on any uncaught page error: a crash that React swallows into a
// blank screen would otherwise surface only as a confusing locator timeout.
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = []
    page.on('pageerror', (err) => errors.push(err))
    await use(page)
    expect(errors, errors.map((e) => e.stack).join('\n\n')).toEqual([])
  },
})

export { expect }
