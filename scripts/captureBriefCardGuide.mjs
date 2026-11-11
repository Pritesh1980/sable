import { chromium, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { openIdeaWithPhoto, openBriefCardFixture } from '../e2e/fixtures.js'

const baseURL = process.env.GUIDE_URL || 'http://localhost:15474'
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
  throw new Error('Brief guide capture requires an isolated local demo server')
}
const output = fileURLToPath(new URL('../public/guide/', import.meta.url))
const browser = await chromium.launch()
try {
  for (const mobile of [true, false]) {
    const context = await browser.newContext({
      baseURL, serviceWorkers: 'block', isMobile: mobile, hasTouch: mobile,
      viewport: mobile ? { width: 430, height: 920 } : { width: 1280, height: 900 },
    })
    await context.route('**/*', (route) => {
      const { hostname } = new URL(route.request().url())
      return ['localhost', '127.0.0.1', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(hostname)
        ? route.continue() : route.abort()
    })
    const page = await context.newPage()
    if (mobile) {
      await openIdeaWithPhoto(page)
    } else {
      await openBriefCardFixture(page)
      await page.getByRole('button', { name: 'Preview card', exact: true }).click()
      await expect(page.getByRole('img', { name: 'Brief card preview' })).toBeVisible()
    }
    await expect(page.getByRole('button', { name: mobile ? 'Share as image' : 'Share this card' })).toBeEnabled()
    await page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all([...document.images].filter((image) => image.getBoundingClientRect().width > 0)
        .map((image) => image.decode().catch(() => {})))
    })
    await page.screenshot({ path: output + (mobile ? 'brief-idea-editor.png' : 'brief-card-preview.png'), animations: 'disabled' })
    await context.close()
  }
} finally {
  await browser.close()
}
