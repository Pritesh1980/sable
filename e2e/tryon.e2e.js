import { test, expect, openDemo, openResult, swipe, twoFinger, DEMO_CONCEPT } from './fixtures'

// Trying a concept on skin, both ways: the paid Gemini edit (with the network
// call intercepted — no key, no cost, no Google) and the free live camera,
// which runs against Chromium's fake camera device (see playwright.config.js).

const GEMINI = 'https://generativelanguage.googleapis.com/**'
const KEY = 'e2e-not-a-real-key'

// A small solid-colour PNG drawn by the page itself, so the suite commits no
// binary fixtures. Returned as a Buffer for setInputFiles.
async function pngOf(page, colour) {
  const dataUrl = await page.evaluate((fill) => {
    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 96
    const context = canvas.getContext('2d')
    context.fillStyle = fill
    context.fillRect(0, 0, 96, 96)
    return canvas.toDataURL('image/png')
  }, colour)
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

const resultCount = (page) => page.getByText(/^\d+ results?$/)

async function openTryOn(page, storage) {
  await openDemo(page, '/concepts', { concepts: [DEMO_CONCEPT], storage })
  await openResult(page)
  await expect(resultCount(page)).toHaveText('1 result')
  await page.getByRole('button', { name: /on skin$/ }).tap()
  const drawer = page.getByRole('dialog', { name: 'Try on skin' })
  await expect(drawer).toBeVisible()
  return drawer
}

test('Gemini try-on sends photo + design with the key in a header, and saves the result', async ({ page }) => {
  const drawer = await openTryOn(page, { gemini_api_key: KEY })
  const result = await pngOf(page, '#c8a080')
  const calls = []
  await page.route(GEMINI, async (route) => {
    calls.push(route.request())
    await route.fulfill({
      json: { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: result.toString('base64') } }] } }] },
    })
  })

  await drawer.getByLabel('Photo of the placement').setInputFiles({
    name: 'arm.png', mimeType: 'image/png', buffer: await pngOf(page, '#d2a47c'),
  })
  await expect(drawer.getByAltText('Your placement photo')).toBeVisible()
  await drawer.getByRole('combobox').selectOption('forearm')
  await drawer.getByRole('button', { name: 'Generate preview' }).tap()

  await expect(drawer.getByAltText(/on skin preview$/)).toBeVisible()
  expect(calls).toHaveLength(1)
  const request = calls[0]
  // The key travels in a header, never the URL (URLs end up in logs).
  expect(request.headers()['x-goog-api-key']).toBe(KEY)
  expect(request.url()).not.toContain(KEY)
  const parts = request.postDataJSON().contents[0].parts
  expect(parts.map((part) => Object.keys(part)[0])).toEqual(['text', 'inlineData', 'inlineData'])
  expect(parts[0].text).toContain('forearm')

  // Saving closes the drawer by itself, back onto the concept's results.
  await drawer.getByRole('button', { name: 'Save as variant' }).tap()
  await expect(drawer).toBeHidden()
  await expect(resultCount(page)).toHaveText('2 results')
})

test('without a key, Generate stays off and nothing is sent', async ({ page }) => {
  const drawer = await openTryOn(page)
  let called = false
  await page.route(GEMINI, (route) => { called = true; return route.abort() })
  await drawer.getByLabel('Photo of the placement').setInputFiles({
    name: 'arm.png', mimeType: 'image/png', buffer: await pngOf(page, '#d2a47c'),
  })
  await expect(drawer.getByRole('button', { name: 'Generate preview' })).toBeDisabled()
  expect(called).toBe(false)
})

test('live camera: streams, drags and pinches the design, and saves a snapshot', async ({ page }) => {
  const drawer = await openTryOn(page)
  await drawer.getByRole('button', { name: /live camera/i }).tap()
  const live = page.getByRole('dialog', { name: 'Live try-on' })
  await expect(live).toBeVisible()

  // Chromium's fake camera is a real MediaStream: frames arrive.
  await expect.poll(() => live.locator('video').evaluate((v) => v.readyState >= 2 && v.videoWidth > 0)).toBe(true)

  const overlay = live.getByAltText(/design overlay$/)
  await expect(overlay).toBeVisible()
  const before = await overlay.boundingBox()
  const cx = before.x + before.width / 2
  const cy = before.y + before.height / 2

  await swipe(page, [cx, cy], [cx + 60, cy + 40])
  const moved = await overlay.boundingBox()
  expect(moved.x - before.x).toBeCloseTo(60, -1)
  expect(moved.y - before.y).toBeCloseTo(40, -1)

  // Spread two fingers about the design's centre: it grows and stays put.
  const mx = moved.x + moved.width / 2
  const my = moved.y + moved.height / 2
  await twoFinger(page, [[mx - 30, my], [mx + 30, my]], [[mx - 60, my], [mx + 60, my]])
  const grown = await overlay.boundingBox()
  expect(grown.width).toBeGreaterThan(moved.width * 1.5)
  expect(grown.x + grown.width / 2).toBeCloseTo(mx, -1)

  await live.getByRole('button', { name: 'Save snapshot' }).tap()
  await expect(live).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(resultCount(page)).toHaveText('2 results')
})

test('live camera refused: falls back to a photo and still saves', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
  })
  const drawer = await openTryOn(page)
  await drawer.getByRole('button', { name: /live camera/i }).tap()
  const live = page.getByRole('dialog', { name: 'Live try-on' })
  await expect(live.getByText(/camera access was blocked/i)).toBeVisible()

  await live.getByLabel('Use a photo instead').setInputFiles({
    name: 'arm.png', mimeType: 'image/png', buffer: await pngOf(page, '#d2a47c'),
  })
  await expect(live.getByAltText('Your placement photo')).toBeVisible()
  await live.getByRole('button', { name: 'Save snapshot' }).tap()
  await expect(live).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(resultCount(page)).toHaveText('2 results')
})
