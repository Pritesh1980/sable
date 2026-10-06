import { readFileSync } from 'node:fs'
import { test, expect, openDemo, isOnTop } from './fixtures'

export const fictionalPhoto = { name: 'fictional-fern.webp', mimeType: 'image/webp',
  buffer: readFileSync('public/images/demo/mora.blackfern/fern-v4.webp') }

async function capture(page) {
  await page.getByRole('button', { name: /^\+ Add$/i }).click()
  return page.getByRole('dialog', { name: 'Add an artist' })
}
async function savedRow(page, handle) {
  return page.evaluate((handle) => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('tattoo_remote_') && key.endsWith('_artistsMeta'))
    return JSON.parse(localStorage.getItem(key) || '[]').find((a) => a.handle === handle)
  }, handle)
}
test.beforeEach(async ({ page }) => {
  await page.route(/(generativelanguage\.googleapis\.com|api\.openai\.com|huggingface\.co)/, (route) => route.abort())
})

for (const width of [320, 375, 430]) {
  test(`profile, photos and duplicate capture persist at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 })
    await openDemo(page, '/gallery')
    let dialog = await capture(page)
    await expect(dialog.locator('details')).not.toHaveAttribute('open')
    const field = dialog.getByLabel('Instagram *')
    await field.fill('https://www.instagram.com/fixture.capture/?igsh=fictional')
    // Reduced visual height models the available space with a phone keyboard.
    await page.setViewportSize({ width, height: 420 })
    await field.focus()
    expect(await isOnTop(dialog.getByRole('button', { name: 'Save', exact: true }))).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: /^Artist saved/ })).toBeVisible()
    await expect.poll(async () => (await savedRow(page, 'fixture.capture'))?.status).toBe('researching')

    await page.setViewportSize({ width, height: 740 })
    dialog = await capture(page)
    await dialog.getByLabel('Choose files').setInputFiles(fictionalPhoto)
    await expect(dialog.getByAltText('Staged reference 1')).toBeVisible()
    await dialog.getByLabel('Instagram *').fill('@FIXTURE.CAPTURE')
    await dialog.getByRole('button', { name: /Add images to.*instead/ }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: '1 photo added to @fixture.capture' })).toBeVisible()
    await expect.poll(async () => (await savedRow(page, 'fixture.capture'))?.images?.[0]?.key).toMatch(/^user\/.+\/artists\/fixture.capture\//)
    await page.reload()
    const row = await savedRow(page, 'fixture.capture')
    expect(row.images).toHaveLength(1)
    expect(row.images[0].key).toBeTruthy()
    await page.getByRole('button', { name: 'Grid view', exact: true }).click()
    const image = page.getByRole('img', { name: '@fixture.capture', exact: true }).first()
    await image.scrollIntoViewIfNeeded()
    await expect.poll(() => image.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true)
  })
}

test('rejects a post, retains a cancelled discard and falls back after clipboard denial', async ({ page }) => {
  await openDemo(page, '/gallery')
  const dialog = await capture(page)
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    read: async () => { throw new DOMException('Denied', 'NotAllowedError') },
  } }))
  await dialog.getByRole('button', { name: 'Paste', exact: true }).click()
  await expect(dialog.getByRole('status')).toHaveText(/Choose a photo or paste a profile link/)
  await dialog.getByLabel('Choose files').setInputFiles(fictionalPhoto)
  await dialog.getByLabel('Instagram *').fill('https://www.instagram.com/p/ABC123/')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText(/not a post or reel link/)
  page.once('dialog', (prompt) => prompt.dismiss())
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog.getByAltText('Staged reference 1')).toBeVisible()
  await dialog.getByLabel('Instagram *').fill('fixture.photo')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect.poll(async () => (await savedRow(page, 'fixture.photo'))?.images?.[0]?.key).toBeTruthy()
})
