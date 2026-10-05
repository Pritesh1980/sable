import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { openRefinementFixture, installRelay, openComposer, sendDraft, submitVariation, canonicalRows } from './refinementFixtures.js'

test('two tabs cannot dispatch a second active job and converge on one saved variant', async ({ page, context }) => {
  const relay = await openRefinementFixture(page)
  const other = await context.newPage()
  await other.goto('concepts')
  await openComposer(page)
  await openComposer(other)
  await sendDraft(page)
  await expect.poll(() => relay.job?.state).toBe('accepted')
  await sendDraft(other)
  await expect(other.getByRole('alert')).toContainText('already in progress')
  expect(relay.dispatches).toBe(1)
  relay.complete()
  await page.reload()
  await other.reload()
  await expect.poll(() => relay.ackProofs.length).toBeGreaterThanOrEqual(1)
  expect((await canonicalRows(page))[0].variants).toHaveLength(1)
  expect((await canonicalRows(other))[0].variants).toHaveLength(1)
  expect(relay.dispatches).toBe(1)
})

test('downloaded backup restores paid image and provenance in a fresh offline context', async ({ browser }) => {
  const sourceContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const source = await sourceContext.newPage()
  const relay = await openRefinementFixture(source)
  await submitVariation(source)
  await expect.poll(() => relay.job?.state).toBe('accepted')
  relay.complete()
  await expect.poll(() => relay.ackProofs.length).toBe(1)
  const savedVariant = (await canonicalRows(source))[0].variants[0]
  const downloadPromise = source.waitForEvent('download')
  await source.getByRole('dialog', { name: 'Refine image' }).getByRole('button', { name: 'Export full library backup' }).click()
  const downloaded = await downloadPromise
  const backup = await readFile(await downloaded.path())
  await expect(source.getByRole('status').filter({ hasText: 'Download requested' }).first()).toBeVisible()
  expect(JSON.parse(backup).data.concepts[0].variants[0].imageUrl).toMatch(/^data:image\/png;base64,/)
  await sourceContext.close()

  const freshContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  try {
    await installRelay(freshContext, { enabled: false })
    const fresh = await freshContext.newPage()
    await fresh.addInitScript(() => localStorage.setItem('refinement-fixture-session', JSON.stringify({ user: { id: 'fixture-owner', email: 'fixture@example.invalid' } })))
    await fresh.goto('settings')
    await expect(fresh.getByRole('button', { name: 'Import Backup' })).toBeVisible()
    await expect(fresh.getByText(/external portfolio links remain references/i)).toBeVisible()
    await fresh.locator('input[type=file]').setInputFiles({ name: 'portable-backup.json', mimeType: 'application/json', buffer: backup })
    await expect(fresh.getByText('Backup imported.')).toBeVisible()
    await fresh.goto('concepts')
    await expect(fresh.getByRole('img', { name: 'Temple study', exact: true })).toBeVisible()
    const restored = (await canonicalRows(fresh))[0].variants[0]
    expect(restored.generation).toEqual(savedVariant.generation)
    expect(restored.sourceConceptId).toBe('temple')
    await fresh.getByRole('img', { name: 'Temple study', exact: true }).click()
    await fresh.keyboard.press('i')
    await fresh.getByRole('button', { name: /Expand .* result for Temple study/ }).click()
    const child = fresh.getByRole('region', { name: 'Refinement comparison' }).getByRole('img').last()
    await expect(child).toBeVisible()
    await freshContext.setOffline(true)
    expect(await child.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true)
    const loaded = await child.evaluate(async img => (await fetch(img.src)).ok)
    expect(loaded).toBe(true)
  } finally { await freshContext.close() }
})
