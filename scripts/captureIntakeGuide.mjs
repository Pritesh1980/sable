import { chromium, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { openDemo } from '../e2e/fixtures.js'

const baseURL = process.env.GUIDE_URL || 'http://localhost:5174'
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
  throw new Error('Guide capture requires an isolated local offline server')
}
const output = fileURLToPath(new URL('../public/guide/', import.meta.url))
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block',
    viewport: { width: 430, height: 920 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)
      ? route.continue() : route.abort()
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openDemo(page, '/')
  async function capture(name) {
    await page.evaluate(() => document.fonts.ready)
    await expect(page.locator('#root')).not.toBeEmpty()
    await page.evaluate(() => Promise.all(document.getAnimations()
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => {}))))
    await expect.poll(() => page.evaluate(() => [...document.images].filter((img) => {
      const rect = img.getBoundingClientRect()
      return rect.width && rect.height && rect.top < innerHeight && rect.bottom > 0
        && (!img.complete || !img.naturalWidth)
    }).map((img) => img.src))).toEqual([])
    await page.screenshot({ path: `${output}${name}.png`, fullPage: false })
    console.log(`Captured ${name}`)
  }
  await page.goto('/gallery')
  await page.getByRole('button', { name: '+ Add', exact: true }).click()
  await page.getByLabel('Choose files').setInputFiles(fileURLToPath(new URL('../public/images/demo/mora.blackfern/fern-v4.webp', import.meta.url)))
  await page.getByLabel('Instagram *').fill('@fern.study')
  await capture('artist-capture')
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await capture('settings')
  await page.goto('/help')
  await expect(page.getByRole('heading', { name: 'How to use Sable', exact: true })).toBeVisible()
  await capture('help-overview')
  expect(errors).toEqual([])
} finally { await browser.close() }
