import { test, expect, openDemo, openBriefCardFixture, swipe } from './fixtures'

async function previewBytes(dialog) {
  return dialog.getByRole('img', { name: 'Brief card preview' }).evaluate(async (img) => {
    const blob = await (await fetch(img.src)).blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.readAsDataURL(blob)
    })
  })
}

test('touch markup annotates a reference photo cleanly across reorder, crop, export toggle, and reload (#208)', async ({ page }) => {
  await openBriefCardFixture(page, { missing: true })

  // 1. Offline/missing local photo and external web URL cannot be annotated
  await page.getByRole('button', { name: 'Mark up reference 1' }).click()
  const missingDialog = page.getByRole('dialog', { name: 'Mark up reference 1' })
  await expect(missingDialog.getByText(/Could not load|bytes can be read/i)).toBeVisible()
  await expect(missingDialog.getByRole('button', { name: 'Apply markup' })).toBeDisabled()
  await missingDialog.getByRole('button', { name: 'Close markup editor' }).click()

  await page.getByRole('button', { name: 'Mark up reference 2' }).click()
  const externalDialog = page.getByRole('dialog', { name: 'Mark up reference 2' })
  await expect(externalDialog.getByText(/Web image links stay referenced/i)).toBeVisible()
  await expect(externalDialog.getByRole('button', { name: 'Apply markup' })).toBeDisabled()
  await externalDialog.getByRole('button', { name: 'Close markup editor' }).click()

  // 2. Readable reference photo: draw a circle and an arrow via real touch gestures, add labels, test Undo/Redo
  await page.getByRole('button', { name: 'Mark up reference 3' }).click()
  const markupDialog = page.getByRole('dialog', { name: 'Mark up reference 3' })
  const stage = markupDialog.getByTestId('markup-stage')
  await expect(stage).toBeVisible()
  await stage.scrollIntoViewIfNeeded()
  const box = await stage.boundingBox()
  expect(box.width).toBeGreaterThan(100)
  expect(box.height).toBeGreaterThan(100)

  const cx = box.x + box.width * 0.45
  const cy = box.y + box.height * 0.45
  await swipe(page, [cx, cy], [cx + 55, cy])
  await markupDialog.getByLabel('Mark label').pressSequentially('Keep fern curve')
  await expect(markupDialog.getByLabel('Mark label')).toHaveValue('Keep fern curve')
  await expect(markupDialog.getByText('Keep fern curve').first()).toBeVisible()

  await markupDialog.getByRole('button', { name: 'Arrow', pressed: false }).click()
  await swipe(page, [box.x + box.width * 0.25, box.y + box.height * 0.25], [box.x + box.width * 0.7, box.y + box.height * 0.7])
  await markupDialog.getByLabel('Mark label').pressSequentially('Soft tip')
  await expect(markupDialog.getByText('Soft tip').first()).toBeVisible()

  // Escape while dirty in real Chromium opens discard guard without losing edits
  await page.keyboard.press('Escape')
  await expect(markupDialog.getByText(/Discard unsaved markup changes/i)).toBeVisible()
  await markupDialog.getByRole('button', { name: 'Keep editing' }).click()
  await expect(markupDialog.getByText(/Discard unsaved markup changes/i)).not.toBeVisible()

  // Single Undo clears the typed label without deleting one character at a time
  await markupDialog.getByRole('button', { name: 'Undo' }).click()
  await expect(markupDialog.getByLabel('Mark label')).toHaveValue('')
  await markupDialog.getByRole('button', { name: 'Redo' }).click()
  await expect(markupDialog.getByLabel('Mark label')).toHaveValue('Soft tip')

  await markupDialog.getByRole('button', { name: 'Apply markup' }).click()
  await expect(page.getByRole('button', { name: 'Mark up reference 3' })).toHaveText('Mark up (2)')
  await expect(page.getByPlaceholder('What to borrow from this image…').nth(2)).toHaveValue('Reference 1')

  // 3. Reorder the annotated reference and verify markup moves with that exact occurrence
  await page.getByRole('button', { name: 'Move reference 3 later' }).click()
  await expect(page.getByRole('button', { name: 'Mark up reference 4' })).toHaveText('Mark up (2)')
  await expect(page.getByPlaceholder('What to borrow from this image…').nth(3)).toHaveValue('Reference 1')

  // 4. Preview card: cropped export includes markup by default, and toggling Off produces clean unannotated export bytes
  await page.getByRole('button', { name: 'Preview card', exact: true }).click()
  const previewDialog = page.getByRole('dialog', { name: 'Preview card', exact: true })
  const shareBtn = previewDialog.getByRole('button', { name: 'Share this card' })
  await expect(shareBtn).toBeEnabled()
  const bytesInitial = await previewBytes(previewDialog)

  const zoom = previewDialog.getByRole('slider', { name: 'Zoom reference 4' })
  await zoom.focus()
  await zoom.press('ArrowRight')
  await expect(zoom).toHaveValue('1.05')
  await expect(shareBtn).toBeEnabled()
  const bytesAnnotatedCropped = await previewBytes(previewDialog)
  expect(bytesAnnotatedCropped).not.toBe(bytesInitial)

  const toggle = previewDialog.getByRole('switch', { name: 'Show markup on card reference 4' })
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(shareBtn).toBeEnabled()
  const bytesCleanCropped = await previewBytes(previewDialog)
  expect(bytesCleanCropped).not.toBe(bytesAnnotatedCropped)

  // Turn export markup back on so both crop and markup persist in saved state
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(shareBtn).toBeEnabled()
  await previewDialog.getByRole('button', { name: 'Close card preview' }).click()

  // 5. Save and verify durable storage has original source ref, markup, crop, and zero blob: URLs
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => page.evaluate(() => {
    const user = JSON.parse(localStorage.getItem('tattoo_local_session')).user
    const stored = JSON.parse(localStorage.getItem(`tattoo_remote_${user.id}_ideas`) || '[]')[0]
    return stored?.images?.[3]?.markup?.length
  })).toBe(2)

  const storedSummary = await page.evaluate(() => {
    const user = JSON.parse(localStorage.getItem('tattoo_local_session')).user
    const raw = localStorage.getItem(`tattoo_remote_${user.id}_ideas`) || '[]'
    const idea = JSON.parse(raw)[0]
    return {
      hasBlob: raw.includes('blob:'),
      ref: idea.images[3],
    }
  })
  expect(storedSummary.hasBlob).toBe(false)
  expect(storedSummary.ref).toMatchObject({
    url: 'images/demo/mora.blackfern/fern-v4.webp',
    note: 'Reference 1',
    briefCrop: { zoom: 1.05 },
  })
  expect(storedSummary.ref.markup.map((m) => [m.kind, m.label])).toEqual([
    ['circle', 'Keep fern curve'],
    ['arrow', 'Soft tip'],
  ])

  // 6. Reload and confirm markup & order persist
  await page.reload()
  await page.getByText('Card arrangement study', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Mark up reference 4' })).toHaveText('Mark up (2)')
})

test('tall 9:16 portrait stage keeps finger alignment and aligned circle pixels in Brief card export (#208)', async ({ page }) => {
  await openDemo(page, '/brief')
  await page.goto('/manifest.json')
  await page.evaluate(() => {
    const user = JSON.parse(localStorage.getItem('tattoo_local_session')).user
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 360 640"><rect width="360" height="640" fill="#141210"/></svg>'
    const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
    const rows = [{
      id: 'tall-portrait-study',
      title: 'Tall portrait alignment study',
      description: 'Check 9:16 coordinate fidelity.',
      tags: ['fine-line'],
      placement: 'forearm',
      images: [{ url: dataUrl, note: 'Portrait 9:16' }],
      linkedArtists: [],
      status: 'idea',
      updatedAt: '2026-11-11T10:00:00.000Z',
    }]
    localStorage.setItem('tattoo_ideas', JSON.stringify(rows))
    localStorage.setItem(`tattoo_remote_${user.id}_ideas`, JSON.stringify(rows))
  })
  await page.goto('/brief')
  await page.getByText('Tall portrait alignment study', { exact: true }).click()
  await page.getByRole('button', { name: 'Mark up reference 1' }).click()

  const markupDialog = page.getByRole('dialog', { name: 'Mark up reference 1' })
  const stage = markupDialog.getByTestId('markup-stage')
  await expect(stage).toBeVisible()
  await stage.scrollIntoViewIfNeeded()
  const box = await stage.boundingBox()
  // Stage keeps 9:16 portrait aspect ratio instead of full-width letterboxing
  expect(box.width / box.height).toBeCloseTo(360 / 640, 1)

  // Drag near upper-right (0.78, 0.22) -> normalized mark must land right under finger
  const tapX = box.x + box.width * 0.78
  const tapY = box.y + box.height * 0.22
  await swipe(page, [tapX, tapY], [tapX + 20, tapY])
  await markupDialog.getByRole('button', { name: 'Apply markup' }).click()

  await page.getByRole('button', { name: 'Preview card', exact: true }).click()
  const previewDialog = page.getByRole('dialog', { name: 'Preview card', exact: true })
  const vertical = previewDialog.getByRole('slider', { name: 'Vertical reference 1' })
  await vertical.focus()
  await vertical.press('Home')
  await expect(vertical).toHaveValue('0')
  await expect(previewDialog.getByRole('button', { name: 'Share this card' })).toBeEnabled()
  // Count red accent pixels inside right vs left half of the exported card image slot
  const counts = await previewDialog.getByRole('img', { name: 'Brief card preview' }).evaluate(async (img) => {
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || 1080
    canvas.height = img.naturalHeight || 1350
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let leftHalf = 0
    let rightHalf = 0
    for (let y = Math.floor(height * 0.35); y < Math.floor(height * 0.85); y += 1) {
      for (let x = Math.floor(width * 0.1); x < Math.floor(width * 0.9); x += 1) {
        const i = (y * width + x) * 4
        if (data[i] > 180 && data[i + 1] < 105 && data[i + 2] < 105) {
          if (x < width / 2) leftHalf += 1
          else rightHalf += 1
        }
      }
    }
    return { leftHalf, rightHalf }
  })
  expect(counts.rightHalf).toBeGreaterThan(20)
  expect(counts.leftHalf).toBe(0)

  await previewDialog.getByRole('button', { name: 'Close card preview' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => page.evaluate(() => {
    const user = JSON.parse(localStorage.getItem('tattoo_local_session')).user
    return JSON.parse(localStorage.getItem(`tattoo_remote_${user.id}_ideas`) || '[]')[0]?.images?.[0]?.markup?.[0]
  })).toBeTruthy()
  const mark = await page.evaluate(() => {
    const user = JSON.parse(localStorage.getItem('tattoo_local_session')).user
    return JSON.parse(localStorage.getItem(`tattoo_remote_${user.id}_ideas`) || '[]')[0]?.images?.[0]?.markup?.[0]
  })
  expect(mark.x).toBeGreaterThan(0.72)
  expect(mark.x).toBeLessThan(0.84)
  expect(mark.y).toBeGreaterThan(0.16)
  expect(mark.y).toBeLessThan(0.28)
})
