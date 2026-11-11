import { chromium, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { openConceptIdeaFixture, openConceptIdeaVariant } from '../e2e/fixtures.js'

const baseURL = process.env.GUIDE_URL || 'http://localhost:15484'
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Guide capture requires a local demo server')
const output = fileURLToPath(new URL('../public/guide/', import.meta.url))
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block', isMobile: true, hasTouch: true,
    viewport: { width: 430, height: 920 } })
  await context.route('**/*', route => ['localhost', '127.0.0.1', 'fonts.googleapis.com', 'fonts.gstatic.com']
    .includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  const page = await context.newPage()
  await openConceptIdeaFixture(page)
  await openConceptIdeaVariant(page)
  await page.getByRole('button', { name: 'Add to existing idea' }).tap()
  await page.getByRole('button', { name: 'Existing forearm plan' }).tap()
  await page.evaluate(async () => { await document.fonts.ready })
  await page.getByRole('dialog', { name: 'Use in idea' }).locator('img').evaluateAll(async images => {
    await Promise.all(images.map(img => img.decode().catch(() => {})))
  })
  await page.screenshot({ path: output + 'concept-idea-picker.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'New idea', exact: true }).tap()
  await page.getByRole('button', { name: 'Create idea' }).tap()
  await expect(page.getByPlaceholder('Idea title…')).toHaveValue('Moonlit temple study')
  await expect(page.getByRole('button', { name: 'Share as image' })).toBeEnabled()
  await page.screenshot({ path: output + 'concept-idea-draft.png', animations: 'disabled' })
  await context.close()
} finally { await browser.close() }
