import { test, expect } from '@playwright/test'
import { openRefinementFixture, submitVariation, canonicalRows, openComposer, orientationJpeg, ROW_KEY, fixtureConcept } from './refinementFixtures.js'

test('reload recovery imports once and acknowledges only after canonical save', async ({ page }) => {
  const relay = await openRefinementFixture(page)
  await submitVariation(page)
  await expect.poll(() => relay.job?.state).toBe('accepted')
  relay.complete()
  await page.reload()
  await expect(page.getByText('Variation saved', { exact: true })).toBeVisible()
  const rows = await canonicalRows(page)
  expect(rows[0].variants).toHaveLength(1)
  expect(rows[0].variants[0].imageUrl).toMatch(/^user\/fixture-owner\/concepts\//)
  expect(relay.posts).toBe(1)
  expect(relay.ackProofs).toHaveLength(1)
  expect(relay.ackProofs[0].image).toMatch(/^data:image\/png;base64,/)
  await page.reload()
  expect((await canonicalRows(page))[0].variants).toHaveLength(1)
  expect(relay.posts).toBe(1)
})

test('lost acceptance retries identical bytes and key without creating a second job', async ({ page }) => {
  const relay = await openRefinementFixture(page, { lostResponse: true })
  await submitVariation(page)
  await expect(page.getByRole('alert')).toContainText('Acceptance is unknown')
  const retainedPrompt = relay.requests[0].request.prompt
  await page.getByLabel('Change', { exact: true }).fill('A newer editable draft')
  await expect(page.getByLabel('Saved request prompt')).toHaveText(retainedPrompt)
  await expect(page.getByRole('img', { name: 'Saved request source' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry same request' }).click()
  await expect.poll(() => relay.posts).toBe(2)
  expect(relay.requests[0].requestId).toBe(relay.requests[1].requestId)
  expect(relay.requests[0].image.equals(relay.requests[1].image)).toBe(true)
  expect(relay.requests[0].request).toEqual(relay.requests[1].request)
  expect(relay.dispatches).toBe(1)
  relay.complete()
  await expect.poll(() => relay.ackProofs.length).toBe(1)
})

test('disabled payment still recovers a previously accepted result', async ({ page }) => {
  const relay = await openRefinementFixture(page)
  await submitVariation(page)
  await expect.poll(() => relay.job?.state).toBe('accepted')
  relay.enabled = false
  relay.complete()
  await page.reload()
  await expect(page.getByText('Variation saved', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Check recovery' }).click()
  await expect(page.getByRole('button', { name: 'Generate one variation' })).toHaveCount(0)
  expect(relay.posts).toBe(1)
  expect(relay.ackProofs).toHaveLength(1)
})

test('failed canonical save withholds acknowledgement and a recovery retry saves once', async ({ page }) => {
  const relay = await openRefinementFixture(page)
  await submitVariation(page)
  await expect.poll(() => relay.job?.state).toBe('accepted')
  await page.evaluate(key => {
    const original = Storage.prototype.setItem
    window.refinementFailSave = true
    Storage.prototype.setItem = function (name, value) {
      if (window.refinementFailSave && name === key && value.includes('"provenance":"relay"')) {
        throw new DOMException('Fixture quota', 'QuotaExceededError')
      }
      return original.call(this, name, value)
    }
  }, ROW_KEY)
  relay.complete()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(relay.ackProofs).toHaveLength(0)
  expect((await canonicalRows(page))[0].variants).toHaveLength(0)
  await page.evaluate(() => { window.refinementFailSave = false })
  await page.getByRole('dialog', { name: 'Refine image' }).getByRole('button', { name: 'Check recovery' }).click()
  await expect.poll(() => relay.ackProofs.length).toBe(1)
  expect((await canonicalRows(page))[0].variants).toHaveLength(1)
})

test('expired input requires explicit new-payment confirmation and a new key', async ({ page }) => {
  const relay = await openRefinementFixture(page)
  relay.expired = true
  await submitVariation(page)
  await expect(page.getByRole('alert')).toContainText('request has expired')
  const start = page.getByRole('button', { name: 'Start a confirmed new request' })
  await expect(start).toBeDisabled()
  relay.expired = false
  await page.getByRole('checkbox', { name: /Confirm a new paid request/ }).check()
  await start.click()
  await expect.poll(() => relay.posts).toBe(2)
  expect(relay.attemptIds[1]).not.toBe(relay.attemptIds[0])
})

test('uncertain provider outcome does not silently start another paid request', async ({ page }) => {
  const relay = await openRefinementFixture(page)
  await submitVariation(page)
  await expect.poll(() => relay.job?.state).toBe('accepted')
  relay.uncertain()
  await expect(page.getByText('Provider outcome unknown', { exact: true }).first()).toBeVisible()
  await page.reload()
  await openComposer(page)
  await expect(page.getByText('Provider outcome unknown', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /Confirm a new paid request/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Generate one variation' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Start a confirmed new request' })).toBeDisabled()
  expect(relay.posts).toBe(1)
})

test('expired result is not acknowledged or described as saved', async ({ page }) => {
  const relay = await openRefinementFixture(page)
  await submitVariation(page)
  await expect.poll(() => relay.job?.state).toBe('accepted')
  relay.resultExpired = true
  relay.complete()
  await expect(page.getByRole('alert')).toContainText('service copy is no longer available')
  expect(relay.ackProofs).toHaveLength(0)
  expect((await canonicalRows(page))[0].variants).toHaveLength(0)
})

test('deleted destination requires a choice and preserves the unavailable source lineage', async ({ page }) => {
  const relay = await openRefinementFixture(page)
  await submitVariation(page)
  await expect.poll(() => relay.job?.state).toBe('accepted')
  await page.evaluate(({ key, row }) => localStorage.setItem(key, JSON.stringify([{ ...row, id: 'other', prompt: 'New destination' }])), { key: ROW_KEY, row: fixtureConcept })
  relay.complete()
  await page.reload()
  await page.getByRole('button', { name: 'Check recovery' }).click()
  expect(relay.ackProofs).toHaveLength(0)
  await page.getByLabel(`Destination for ${relay.job.id}`).selectOption('other')
  await page.getByRole('button', { name: 'Save recovered variation' }).click()
  await expect.poll(() => relay.ackProofs.length).toBe(1)
  const variant = (await canonicalRows(page))[0].variants[0]
  expect(variant.sourceConceptId).toBe('temple')
  await expect(page.getByText('Source image unavailable').first()).toBeVisible()
})

test('sign-out during result download prevents late import and acknowledgement', async ({ page }) => {
  const relay = await openRefinementFixture(page)
  let release
  relay.resultGate = new Promise(resolve => { release = resolve })
  await submitVariation(page)
  await expect.poll(() => relay.job?.state).toBe('accepted')
  const downloading = page.waitForRequest('**/result')
  relay.complete()
  await downloading
  await page.evaluate(() => window.dispatchEvent(new Event('refinement-fixture-signout')))
  await expect(page.getByRole('dialog', { name: 'Refine image' })).toHaveCount(0)
  release()
  await expect(page.getByRole('button', { name: /Sign in/i }).first()).toBeVisible()
  expect(relay.ackProofs).toHaveLength(0)
  expect((await canonicalRows(page))[0].variants).toHaveLength(0)
})

test('preparation retains alpha, applies orientation and traps focus above the viewer', async ({ page }) => {
  await openRefinementFixture(page)
  await openComposer(page)
  const image = page.getByRole('img', { name: 'Prepared source image' })
  const pixel = await image.evaluate(img => {
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
    return { empty: ctx.getImageData(0, 0, 1, 1).data[3], partial: ctx.getImageData(20, 20, 1, 1).data[3] }
  })
  expect(pixel).toEqual({ empty: 0, partial: 128 })
  await page.getByLabel('Source image file').setInputFiles({ name: 'oriented.jpg', mimeType: 'image/jpeg', buffer: orientationJpeg })
  await expect.poll(() => image.evaluate(img => [img.naturalWidth, img.naturalHeight])).toEqual([48, 32])
  const dialog = page.getByRole('dialog', { name: 'Refine image' })
  await page.keyboard.press('Tab')
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: /Temple study/ })).toBeVisible()
})

test('saved comparison actions update the child and open try-on above the viewer', async ({ page }) => {
  const relay = await openRefinementFixture(page)
  await submitVariation(page)
  await expect.poll(() => relay.job?.state).toBe('accepted')
  relay.complete()
  await expect.poll(() => relay.ackProofs.length).toBe(1)
  const comparison = page.getByRole('region', { name: 'Refinement comparison' })
  await comparison.getByRole('button', { name: 'Mark variation as Best' }).click()
  await comparison.getByLabel('Variation rating').selectOption('4')
  await expect.poll(async () => {
    const variant = (await canonicalRows(page))[0].variants[0]
    return { best: variant.isBest, rating: variant.rating }
  }).toEqual({ best: true, rating: 4 })
  await comparison.getByRole('button', { name: 'Try variation on skin' }).click()
  await expect(page.getByRole('dialog', { name: 'Refine image' })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Try on skin' })).toBeVisible()
  expect(relay.posts).toBe(1)
})
