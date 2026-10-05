import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { openDemo } from './fixtures.js'
import { fixtureConcept, resultPng } from './refinementFixtures.js'

test('public demo copies actual text, exports separate PNG bytes and imports an attributed raster', async ({ page, context }) => {
  const outgoing = []
  await context.route(/https?:\/\/[^/]*(?:openai\.com|supabase\.(?:co|com))\//, route => { outgoing.push(route.request().url()); return route.abort() })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openDemo(page, '/concepts', { concepts: [fixtureConcept] })
  await page.getByRole('img', { name: 'Temple study', exact: true }).click()
  await page.getByRole('button', { name: 'Refine this', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Prepared source image' })).toBeVisible()
  const originalKey = await page.evaluate(() => JSON.parse(localStorage.getItem('tattoo_concepts'))[0].imageUrl)
  const preparedBytes = Buffer.from(await page.getByRole('img', { name: 'Prepared source image' }).evaluate(async img =>
    Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer()))))
  await expect(page.getByRole('button', { name: 'Generate one variation' })).toHaveCount(0)
  await page.getByLabel('Change', { exact: true }).fill('More mist / પ્રીતેશ')
  await page.getByRole('radio', { name: 'Colour', exact: true }).check()
  const prompt = await page.getByLabel('Outgoing prompt').textContent()
  await page.getByRole('button', { name: 'Copy refinement prompt' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(prompt)
  expect(prompt).toContain('પ્રીતેશ')
  expect(prompt).not.toMatch(/monochrome|no text/i)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export source image' }).click()
  const downloaded = await downloadPromise
  const bytes = await readFile(await downloaded.path())
  expect(bytes.equals(preparedBytes)).toBe(true)
  await expect(page.getByText('Source download requested. Check that the file was saved.')).toBeVisible()
  await page.getByLabel('Variation provider').selectOption('chatgpt')
  await page.getByLabel('Variation image').setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
  await page.getByRole('button', { name: 'Import variation' }).click()
  await expect(page.getByRole('alert')).toContainText('Could not import this image')
  await page.getByLabel('Variation image').setInputFiles({ name: 'variation.png', mimeType: 'image/png', buffer: resultPng })
  await page.getByRole('button', { name: 'Import variation' }).click()
  await expect(page.getByText(/Variation imported with your provider attribution/)).toBeVisible()
  const rows = await page.evaluate(() => JSON.parse(localStorage.getItem('tattoo_concepts')))
  expect(rows[0].imageUrl).toBe(originalKey)
  expect(rows[0].variants[0].generation).toMatchObject({ provenance: 'user-import', provider: 'chatgpt' })
  expect(rows[0].variants[0].generation.jobId).toBeUndefined()
  expect(outgoing).toEqual([])
  await page.getByRole('button', { name: 'Close refinement' }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '+ New concept' }).click()
  // Existing mobile composer sits below the bottom nav; use its keyboard path.
  await page.getByRole('button', { name: /AI setup/i }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByPlaceholder(/^sk-/)).toBeAttached()
})
