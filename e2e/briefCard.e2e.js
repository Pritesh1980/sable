import { test, expect, openIdeaWithPhoto } from './fixtures'

function readPngDimensions(bytes) {
  // PNG signature (8 bytes) + IHDR length (4) + 'IHDR' (4) + width (4 BE) + height (4 BE)
  const buf = Buffer.from(bytes)
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR')
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  }
}

test('Share as image downloads a 1080×1350 PNG when file sharing is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false })
  })
  await openIdeaWithPhoto(page)
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Share as image' }).click()
  await expect(page.getByRole('button', { name: 'Download requested' })).toBeDisabled()
  await expect(page.getByRole('status')).toHaveText('PNG download requested.')
  const download = await downloadEvent
  expect(download.suggestedFilename()).toMatch(/^sable-brief-.+\.png$/)
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  const { width, height } = readPngDimensions(Buffer.concat(chunks))
  expect(width).toBe(1080)
  expect(height).toBe(1350)
  await expect(page.getByRole('button', { name: 'Share as image' })).toBeEnabled()
})

test('a 375px phone keeps Share and Copy in their own row away from Delete', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openIdeaWithPhoto(page)
  const copy = await page.getByRole('button', { name: 'Copy brief', exact: true }).boundingBox()
  const share = await page.getByRole('button', { name: 'Share as image', exact: true }).boundingBox()
  const remove = await page.getByRole('button', { name: 'Delete', exact: true }).boundingBox()
  expect(copy.y).toBeCloseTo(share.y, 0)
  expect(share.y).toBeGreaterThanOrEqual(remove.y + remove.height)
  expect(share.height).toBeGreaterThanOrEqual(44)
  expect(share.x + share.width).toBeLessThanOrEqual(375)
})

test('Share as image shares a 1080×1350 PNG file via navigator.share and skips web URLs', async ({ page }) => {
  await page.addInitScript(() => {
    window.__sharedFiles = null
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data) => Array.isArray(data?.files) && data.files.length === 1,
    })
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data) => {
        const file = data.files[0]
        const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))
        window.__sharedFiles = {
          count: data.files.length,
          name: file.name,
          type: file.type,
          header: bytes.slice(0, 24),
        }
      },
    })
  })

  await openIdeaWithPhoto(page)
  await page.getByPlaceholder('Paste image URL…').fill('https://example.com/external-ref.jpg')
  await page.getByRole('button', { name: 'Add', exact: true }).click()

  await page.getByRole('button', { name: 'Share as image' }).click()
  await expect(page.getByRole('status')).toHaveText('1 web image not included')

  const shared = await page.evaluate(() => window.__sharedFiles)
  expect(shared).not.toBeNull()
  expect(shared.count).toBe(1)
  expect(shared.name).toMatch(/^sable-brief-.+\.png$/)
  expect(shared.type).toBe('image/png')
  const { width, height } = readPngDimensions(shared.header)
  expect(width).toBe(1080)
  expect(height).toBe(1350)
})
