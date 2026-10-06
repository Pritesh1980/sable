import { chromium, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { openDemo, openIdeaWithPhoto } from '../e2e/fixtures.js'

const baseURL = process.env.GUIDE_URL || 'http://localhost:5174'
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
  throw new Error('Guide capture requires an isolated local offline server')
}
const output = fileURLToPath(new URL('../public/guide/', import.meta.url))
const board = { id: 'guide-board', name: 'Botanical studies',
  description: 'Fern, moon and geometric reference studies',
  ideaIds: ['demo-idea-forest', 'demo-idea-eclipse'], cover: '',
  createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-01T12:00:00.000Z' }
const storage = Object.fromEntries(['tattoo_boards', 'tattoo_remote_boards']
  .map((key) => [key, JSON.stringify([board])]))
const browser = await chromium.launch()
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('#root')).not.toBeEmpty()
  await page.waitForTimeout(500)
  await expect.poll(() => page.evaluate(() => [...document.images].filter((img) => {
    const rect = img.getBoundingClientRect()
    return rect.width && rect.height && rect.top < innerHeight && rect.bottom > 0
      && (!img.complete || !img.naturalWidth)
  }).map((img) => img.src))).toEqual([])
  await page.screenshot({ path: `${output}${name}.png`, fullPage: false })
  console.log(`Captured ${name}`)
}
async function captureIntake(page) {
  await page.goto('/gallery')
  await page.getByRole('button', { name: /^\+ Add$/i }).click()
  await page.getByLabel('Choose files').setInputFiles(fileURLToPath(new URL('../public/images/demo/mora.blackfern/fern-v4.webp', import.meta.url)))
  await page.getByLabel('Instagram *').fill('@fern.study')
  await capture(page, 'artist-capture')
  await page.goto('/settings')
  await capture(page, 'settings')
  await page.goto('/help')
  await capture(page, 'help-overview')
}
try {
  for (const mobile of [false, true]) {
    if (process.env.GUIDE_CAPTURE_ONLY === 'intake' && !mobile) continue
    const context = await browser.newContext({ baseURL, serviceWorkers: 'block',
      viewport: mobile ? { width: 430, height: 920 } : { width: 1280, height: 900 },
      ...(mobile ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' } : {}),
      isMobile: mobile, hasTouch: mobile })
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (['localhost', '127.0.0.1', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.continue()
      return route.abort()
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openDemo(page, '/', { storage })
    if (process.env.GUIDE_CAPTURE_ONLY === 'intake') {
      await captureIntake(page)
      expect(errors).toEqual([])
      await context.close()
      continue
    }
    if (!mobile) {
      await capture(page, 'wall')
      await page.getByRole('figure', { name: 'Mora Vane' }).first().click()
      await page.mouse.move(640, 450)
      await capture(page, 'wall-viewer')
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: /Everything else/ }).click()
      await capture(page, 'drawer')
      await page.goto('/pipeline')
      await capture(page, 'dashboard-desktop')
      await page.goto('/gallery')
      await page.getByRole('button', { name: 'Grid view', exact: true }).click()
      await capture(page, 'gallery-grid-desktop')
    } else {
      for (const [path, name] of [['/pipeline', 'dashboard'], ['/conventions', 'conventions'],
        ['/studios', 'studios'], ['/help', 'help-overview'], ['/brief', 'brief-list']]) {
        await page.goto(path)
        await capture(page, name)
      }
      await openIdeaWithPhoto(page)
      await capture(page, 'brief-idea-editor')
      await page.goto('/brief?tab=boards')
      await capture(page, 'boards-list')
      await page.getByRole('button', { name: /Botanical studies/ }).click()
      await capture(page, 'board-editor')
      await page.goto('/gallery')
      for (const [label, name] of [['Filmstrip view', 'gallery-filmstrip'], ['Grid view', 'gallery-grid'],
        ['Compare artists', 'gallery-compare'], ['Style wall', 'gallery-stylewall']]) {
        await page.getByRole('button', { name: label, exact: true }).click()
        if (name === 'gallery-compare') {
          await page.getByRole('button', { name: /Mora Vane/ }).click()
          await page.getByRole('button', { name: /Vesper Ash/ }).click()
          await page.getByRole('heading', { name: 'Artists', exact: true }).scrollIntoViewIfNeeded()
          await page.getByRole('heading', { name: 'Artists', exact: true }).evaluate((heading) => {
            for (let parent = heading.parentElement; parent; parent = parent.parentElement) parent.scrollTop = 0
          })
        }
        await capture(page, name)
      }
      await page.getByRole('button', { name: 'Grid view', exact: true }).click()
      await page.getByText('Mora Vane', { exact: true }).first().click()
      await capture(page, 'artist-detail')
      await page.goto('/gallery')
      await page.getByRole('button', { name: /Rank/, exact: false }).first().click()
      await capture(page, 'ranking-swipe')
      await page.goto('/gallery?mode=manage')
      await capture(page, 'manage-list')
      await page.getByText('Mora Vane', { exact: true }).first().click()
      await capture(page, 'manage-artist-expanded')
      await captureIntake(page)
    }
    expect(errors).toEqual([])
    await context.close()
  }
} finally { await browser.close() }
