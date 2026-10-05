import { chromium } from 'playwright'
import { expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { openRefinementFixture, openComposer, sendDraft } from '../e2e/refinementFixtures.js'

const output = fileURLToPath(new URL('../public/guide/', import.meta.url))
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `${output}${name}.png`, fullPage: false })
}
try {
  const desktop = await browser.newContext({ baseURL: 'http://localhost:4181',
    viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
  const page = await desktop.newPage()
  const relay = await openRefinementFixture(page)
  await page.getByRole('button', { name: '+ New concept' }).click()
  await page.getByLabel('Your idea').fill('A quiet temple, three pillars and a softened ink wash')
  await capture(page, 'concepts')
  await page.keyboard.press('Escape')
  await openComposer(page)
  await sendDraft(page)
  await expect.poll(() => relay.job?.state).toBe('accepted')
  relay.complete()
  await expect.poll(() => relay.ackProofs.length).toBe(1)
  const comparison = page.getByRole('region', { name: 'Refinement comparison' })
  await comparison.scrollIntoViewIfNeeded()
  await capture(page, 'concept-refinement-compare')
  await page.getByRole('button', { name: 'Close refinement' }).click()
  await page.keyboard.press('i')
  await page.getByRole('button', { name: /Expand .* result for Temple study/ }).click()
  await capture(page, 'concept-card')
  await desktop.close()

  const phone = await browser.newContext({ baseURL: 'http://localhost:4181',
    viewport: { width: 430, height: 920 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
  const mobile = await phone.newPage()
  await openRefinementFixture(mobile)
  await openComposer(mobile)
  await mobile.getByLabel('Change', { exact: true }).fill('Add a soft mist around the temple')
  await mobile.getByLabel('Keep', { exact: true }).fill('Three pillars and the quiet central shape')
  await capture(mobile, 'concept-refinement')
  await mobile.goto('settings')
  await expect(mobile.getByRole('button', { name: 'Export Backup' })).toBeVisible()
  await capture(mobile, 'settings')
  await phone.close()
} finally { await browser.close() }
