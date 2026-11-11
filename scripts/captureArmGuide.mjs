// Guide capture for "See a concept on the arm in 3D" (#195): a saved result
// opened on the 3D arm, close up on the tattoo. Fictional demo design only
// (the lab's hourglass, lifted off a demo photo by extract-design.py).
//
//   GUIDE_URL=http://localhost:15494 node scripts/captureArmGuide.mjs
//
// against an isolated local-backend dev server (docs/MAINTAINING.md).
import { chromium, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { openDemo, centre } from '../e2e/fixtures.js'

const baseURL = process.env.GUIDE_URL || 'http://localhost:15494'
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Guide capture requires a local demo server')
const output = fileURLToPath(new URL('../public/guide/', import.meta.url))

const CONCEPT = {
  id: 'guide-arm-concept',
  prompt: 'Ocean in an hourglass',
  imageUrl: 'models/designs/hourglass.webp',
  response: '',
  tags: ['realism'],
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  variants: [{
    id: 'guide-arm-variant',
    title: 'Hourglass flat design',
    imageUrl: 'models/designs/hourglass.webp',
    provider: 'chatgpt',
    isBest: true,
    createdAt: '2026-09-01T10:05:00.000Z',
  }],
}

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block', isMobile: true, hasTouch: true,
    viewport: { width: 430, height: 920 } })
  await context.route('**/*', route => ['localhost', '127.0.0.1', 'fonts.googleapis.com', 'fonts.gstatic.com']
    .includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  const page = await context.newPage()
  await openDemo(page, `/concepts?concept=${CONCEPT.id}`, { concepts: [CONCEPT] })
  await expect(page.getByRole('dialog', { name: /^Concept: Ocean/ })).toBeVisible()
  await page.touchscreen.tap(...centre(page))
  await page.getByRole('button', { name: 'Variants & STL export' }).tap()
  await page.getByRole('button', { name: /^Expand Hourglass flat design/ }).tap()
  await page.getByRole('button', { name: /on the arm in 3D$/ }).tap()
  const drawer = page.getByRole('dialog', { name: 'On the arm in 3D' })
  await expect(drawer.getByText('Loading the arm…')).toHaveCount(0, { timeout: 20_000 })
  await expect(drawer.getByRole('button', { name: 'Save as variant' })).toBeEnabled()
  // Let the opening framing ease in, then wait for two identical frames.
  const canvas = drawer.getByTestId('arm-placement-3d').locator('canvas')
  let last = await canvas.screenshot()
  await expect.poll(async () => {
    const next = await canvas.screenshot()
    const settled = next.equals(last)
    last = next
    return settled
  }, { timeout: 20_000 }).toBe(true)
  await page.evaluate(async () => { await document.fonts.ready })
  await page.screenshot({ path: output + 'concept-arm.png', animations: 'disabled' })
  await context.close()
} finally { await browser.close() }
