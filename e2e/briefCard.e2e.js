import { test, expect, openIdeaWithPhoto, openBriefCardFixture } from './fixtures'

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

test('chosen cover, crop and exact preview bytes survive export and save/reload', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }))
  await openBriefCardFixture(page)
  await page.getByRole('button', { name: 'Make reference 5 the cover' }).click()
  await expect(page.getByPlaceholder('What to borrow from this image…').first()).toHaveValue('Reference 5')
  await page.getByRole('button', { name: 'Preview card', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Preview card', exact: true })
  const zoom = dialog.getByRole('slider', { name: 'Zoom reference 1' })
  await zoom.focus()
  await zoom.press('ArrowRight')
  await expect(zoom).toHaveValue('1.05')
  const share = dialog.getByRole('button', { name: 'Share this card' })
  await expect(share).toBeEnabled()
  const before = await dialog.getByRole('img', { name: 'Brief card preview' }).evaluate(async (img) => {
    const blob = await (await fetch(img.src)).blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.readAsDataURL(blob)
    })
  })
  const downloadEvent = page.waitForEvent('download')
  await share.click()
  const download = await downloadEvent
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  expect(Buffer.concat(chunks)).toEqual(Buffer.from(before, 'base64'))
  await dialog.getByRole('button', { name: 'Close card preview' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => page.evaluate(() => {
    const user = JSON.parse(localStorage.getItem('tattoo_local_session')).user
    return JSON.parse(localStorage.getItem(`tattoo_remote_${user.id}_ideas`) || '[]')[0]?.images?.[0]?.briefCrop?.zoom
  })).toBe(1.05)
  await page.reload()
  await page.getByText('Card arrangement study', { exact: true }).click()
  await expect(page.getByPlaceholder('What to borrow from this image…').first()).toHaveValue('Reference 5')
  await page.getByRole('button', { name: 'Preview card', exact: true }).click()
  await expect(page.getByRole('slider', { name: 'Zoom reference 1' })).toHaveValue('1.05')
})

for (const width of [320, 430]) {
  test(`preview fits ${width}px, resets crop and Escape closes only its own layer`, async ({ page }) => {
    await page.setViewportSize({ width, height: 920 })
    await openBriefCardFixture(page)
    const preview = page.getByRole('button', { name: 'Preview card', exact: true })
    await preview.click()
    const dialog = page.getByRole('dialog', { name: 'Preview card', exact: true })
    const zoom = dialog.getByRole('slider', { name: 'Zoom reference 1' })
    await zoom.focus()
    await zoom.press('End')
    await expect(zoom).toHaveValue('3')
    await dialog.getByRole('button', { name: 'Reset crop reference 1' }).click()
    await expect(zoom).toHaveValue('1')
    const lastZoom = dialog.getByRole('slider', { name: 'Zoom reference 4' })
    await lastZoom.scrollIntoViewIfNeeded()
    const imageBox = await dialog.getByAltText('Brief card preview').boundingBox()
    expect(imageBox.y).toBeGreaterThanOrEqual(60)
    expect(imageBox.y + imageBox.height).toBeLessThan(600)
    expect(await dialog.evaluate((node) => node.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    for (const locator of [zoom, dialog.getByRole('button', { name: 'Close card preview' })]) {
      const box = await locator.boundingBox()
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByPlaceholder('Idea title…')).toBeVisible()
    await expect(preview).toBeFocused()
  })
}

test('bad and external references stay in the idea but never receive card badges', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 920 })
  await openBriefCardFixture(page, { missing: true })
  await expect(page.getByText('Unavailable · not on card', { exact: true })).toBeVisible()
  await expect(page.getByText('Web link · not on card', { exact: true })).toBeVisible()
  await expect(page.getByText('Card 4', { exact: true })).toHaveCount(1)
  const remove = page.getByRole('button', { name: 'Remove photo' }).first()
  await remove.evaluate((button) => button.scrollIntoView({ block: 'center' }))
  expect(await remove.evaluate((button) => {
    const box = button.getBoundingClientRect()
    return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
  })).toBe(true)
  await remove.tap()
  await expect(page.getByText('Unavailable · not on card', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByText('Unavailable · not on card', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Preview card', exact: true }).click()
  await expect(page.getByRole('slider', { name: 'Zoom reference 3' })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Zoom reference 1' })).toHaveCount(0)
})
