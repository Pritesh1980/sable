import { chromium, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { openDemo } from '../e2e/fixtures.js'

// Guide screenshots for Radar and its Offline pack (#209), from the fictional
// demo: conventions.png (the Radar page as it opens), show-pack.png (a ready
// pack on the UK Tattoo Fest card) and show-pack-viewer.png (that pack opened).
// Run against an isolated local-backend server, as for captureGuide.mjs:
//   GUIDE_URL=http://localhost:15519 node scripts/captureShowPackGuide.mjs
const baseURL = process.env.GUIDE_URL || 'http://localhost:5174'
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
  throw new Error('Guide capture requires an isolated local offline server')
}
const output = fileURLToPath(new URL('../public/guide/', import.meta.url))
const browser = await chromium.launch()

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  await expect.poll(() => page.evaluate(() => [...document.images].filter((img) => {
    const rect = img.getBoundingClientRect()
    return rect.width && rect.height && rect.top < innerHeight && rect.bottom > 0 && (!img.complete || !img.naturalWidth)
  }).length)).toBe(0)
  await page.screenshot({ path: `${output}${name}.png`, fullPage: false })
  console.log(`Captured ${name}`)
}

try {
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block', viewport: { width: 430, height: 920 }, isMobile: true, hasTouch: true })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (['localhost', '127.0.0.1', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.continue()
    return route.abort()
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  // Pinned: the 2027 editions are the upcoming ones, and the pack's time reads the same each run.
  await page.clock.setFixedTime(new Date('2026-11-26T14:00:00'))
  await openDemo(page, '/conventions')
  await expect(page.getByRole('heading', { name: 'Convention Radar' })).toBeVisible()
  await capture(page, 'conventions')

  const hero = page.locator('#convention-uk-tattoo-fest')
  await hero.getByRole('button', { name: 'Edit' }).click()
  await hero.getByRole('button', { name: 'Mora Vane' }).click()
  await hero.getByRole('button', { name: 'Vesper Ash' }).click()
  await hero.getByRole('button', { name: 'Done' }).click()
  const toggle = hero.getByRole('button', { name: /^Offline pack/ })
  await toggle.click()
  await hero.getByRole('button', { name: 'Prepare pack' }).click()
  await expect(hero.getByText(/Ready offline · checked/)).toBeVisible({ timeout: 30_000 })
  await toggle.evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 24))
  await capture(page, 'show-pack')

  await hero.getByRole('button', { name: 'Open pack' }).click()
  const dialog = page.getByRole('dialog', { name: /UK Tattoo Fest 2027/ })
  await expect(dialog.getByText(/Ready offline · checked/)).toBeVisible()
  await capture(page, 'show-pack-viewer')

  expect(errors).toEqual([])
  await context.close()
} finally {
  await browser.close()
}
