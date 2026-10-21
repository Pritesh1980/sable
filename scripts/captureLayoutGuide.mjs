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
  for (const mobile of [true, false]) {
    const context = await browser.newContext({ baseURL, serviceWorkers: 'block',
      viewport: mobile ? { width: 430, height: 920 } : { width: 1280, height: 900 },
      isMobile: mobile, hasTouch: mobile })
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      return ['localhost', '127.0.0.1', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)
        ? route.continue() : route.abort()
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    async function capture(name) {
      await page.evaluate(() => document.fonts.ready)
      await page.evaluate(() => Promise.all(document.getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {}))))
      await expect.poll(() => page.evaluate(() => [...document.images].filter((img) => {
        const box = img.getBoundingClientRect()
        return box.width && box.height && box.top < innerHeight && box.bottom > 0
          && (!img.complete || !img.naturalWidth)
      }).map((img) => img.src))).toEqual([])
      await page.screenshot({ path: `${output}${name}.png`, fullPage: false })
      console.log(`Captured ${name}`)
    }
    await openDemo(page, '/')
    await expect(page.getByRole('button', { name: /add artist/i }).first()).toBeVisible()
    await capture(mobile ? 'wall-mobile' : 'wall')
    await page.goto('/gallery')
    await expect(page.getByRole('heading', { name: 'Artists', exact: true })).toBeVisible()
    await expect(page.getByText('Vesper Ash', { exact: true }).first()).toBeVisible()
    if (mobile) await capture('gallery-filmstrip')
    await page.getByRole('button', { name: 'Grid view', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Vesper Ash', exact: true })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => Promise.all(document.getAnimations()
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => {}))))
    if (!mobile) {
      const cards = await Promise.all(['Vesper Ash', '@ashgrove.tattoo', '@hexen_atlas']
        .map((name) => page.getByRole('button', { name, exact: true }).locator('..').boundingBox()))
      expect(Math.max(...cards.map((box) => box.y)) - Math.min(...cards.map((box) => box.y))).toBeLessThan(2)
    }
    await capture(mobile ? 'gallery-grid' : 'gallery-grid-desktop')
    if (!mobile) {
      for (const viewport of [{ width: 844, height: 390 }, { width: 1280, height: 900 }]) {
        await page.setViewportSize(viewport)
        await page.goto('/')
        const header = page.locator('header').first()
        await expect(header.getByRole('button', { name: /add artist/i })).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const bounds = await header.locator('button').evaluateAll((buttons) => buttons.map((button) => {
          const { x, y, width, height } = button.getBoundingClientRect()
          return { x, y, width, height }
        }))
        for (const box of bounds) expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
        for (let index = 1; index < bounds.length; index += 1) {
          expect(bounds[index].x).toBeGreaterThanOrEqual(bounds[index - 1].x + bounds[index - 1].width)
          expect(Math.abs(bounds[index].y - bounds[0].y)).toBeLessThan(2)
        }
        await page.screenshot({ path: `/private/tmp/sable-wall-${viewport.width}.png` })
        console.log(`Verified one-row header at ${viewport.width}px`)
      }
    } else {
      await page.goto('/help')
      await expect(page.getByRole('heading', { name: 'How to use Sable', exact: true })).toBeVisible()
      await capture('help-overview')
    }
    expect(errors).toEqual([])
    await context.close()
  }
} finally { await browser.close() }
