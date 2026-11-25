import { readFileSync } from 'node:fs'
import { test, expect, openDemo } from './fixtures'

// #210: the same photo uploaded twice into one idea (two keys, identical
// bytes after the app's own compression) is found by Settings → Duplicate
// photos, one copy removed after confirming, and put back with Undo.

const photo = {
  name: 'fictional-fern.webp',
  mimeType: 'image/webp',
  buffer: readFileSync('public/images/demo/mora.blackfern/fern-v4.webp'),
}

const ideaPhotos = (page) => page.evaluate(() => {
  const ideas = JSON.parse(localStorage.getItem('tattoo_ideas') || '[]')
  return ideas.find((i) => i.title === 'Fern twice')?.images?.map((image) => image.key) ?? null
})

const noSideScroll = (page) => page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth)

for (const width of [440, 320]) {
  test(`finds a photo added twice to one idea, removes a copy, and Undo restores it (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 956 })
    await openDemo(page, '/brief?new=1')
    await page.getByPlaceholder('Idea title…').fill('Fern twice')
    const file = page.locator('input[type="file"]')
    await file.setInputFiles(photo)
    await expect(page.getByRole('button', { name: 'Remove photo' })).toHaveCount(1)
    await file.setInputFiles(photo)
    await expect(page.getByRole('button', { name: 'Remove photo' })).toHaveCount(2)
    // The header's Add saves the idea; the second Add belongs to the image-URL field.
    await page.getByRole('button', { name: 'Add', exact: true }).first().click()
    await expect.poll(async () => (await ideaPhotos(page))?.length).toBe(2)
    const [first, second] = await ideaPhotos(page)
    expect(first).not.toBe(second) // two keys: a name check alone would miss this

    await page.goto('/settings')
    const card = page.getByRole('region', { name: 'Duplicate photos' })
    await card.getByRole('button', { name: 'Check for duplicates' }).click()
    const group = card.getByRole('listitem', { name: /^Same photo, \d copies$/ })
    await expect(group).toHaveCount(1, { timeout: 20_000 })
    await expect(group.getByText('Idea · Fern twice, photo 1 of 2')).toBeVisible()
    await expect(group.getByText('Idea · Fern twice, photo 2 of 2')).toBeVisible()
    await expect(card.getByText(/^Checked \d+ of \d+ photos\.$/)).toBeVisible()
    expect(await noSideScroll(page)).toBe(true)

    await group.getByRole('button', { name: 'Remove this copy from Fern twice (copy 2)' }).click()
    await expect(card.getByText('Remove copy 2 from Fern twice? Copy 1 stays there, and nothing else changes.')).toBeVisible()
    expect(await noSideScroll(page)).toBe(true)
    await card.screenshot({ path: test.info().outputPath(`duplicates-confirm-${width}px.png`) })
    await card.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(card.getByRole('status')).toHaveText(/Removed copy 2 from Fern twice\./)
    await expect.poll(() => ideaPhotos(page)).toEqual([first])
    await expect(group).toHaveCount(0)

    await card.getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => ideaPhotos(page)).toEqual([first, second])
    await expect(group).toHaveCount(1)

    // The idea's photos survive a reload: nothing about the bytes changed.
    await page.reload()
    await expect.poll(() => ideaPhotos(page)).toEqual([first, second])
  })
}
