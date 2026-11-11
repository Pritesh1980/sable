import { test, expect, openDemo, openResult, swipe, twoFinger, isOnTop, DEMO_CONCEPT } from './fixtures'

// A saved concept result on the 3D arm (#195): opened from the result's own
// action, in real WebGL with real touch points, and saved back as a variant.
// jsdom has no WebGL and no canvas pixels, so only this proves the stored
// image reaches the arm, the snapshot is a real picture, and that picture is
// of the tattoo rather than of an arm.

// The saved result's image is the bold blackwork serpent card (600 x 760): the
// moth card is hairlines at 12-30% opacity, too faint to measure ink by.
const CONCEPT = {
  ...DEMO_CONCEPT,
  variants: [{ ...DEMO_CONCEPT.variants[0], imageUrl: '/images/demo/ferrum_line/3.svg' }],
}

const resultCount = (page) => page.getByText(/^\d+ results?$/)
const size = (page) => page.getByTestId('placement-size')
const viewer = (page) => page.getByRole('dialog', { name: /^Concept: Moth/ })

async function openOnArm(page) {
  await openDemo(page, '/concepts', { concepts: [CONCEPT] })
  await openResult(page)
  await expect(resultCount(page)).toHaveText('1 result')
  await page.getByRole('button', { name: /on the arm in 3D$/ }).tap()
  const drawer = page.getByRole('dialog', { name: 'On the arm in 3D' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('Loading the arm…')).toHaveCount(0, { timeout: 20_000 })
  const view = drawer.getByTestId('arm-placement-3d')
  await expect(view.locator('canvas')).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Save as variant' })).toBeEnabled()
  const box = await view.boundingBox()
  return { drawer, view, mid: [box.x + box.width / 2, box.y + box.height / 2] }
}

// Where the ink is in a saved picture. The backdrop and the ink are both
// dark, so ink is found by position: pixels well below skin tone with lit skin
// on both sides of them in their row. Returns the share of the picture's height the
// ink spans, and the share of the arm's pixels that are ink.
function measureInk(image) {
  return image.evaluate(async (img) => {
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const context = canvas.getContext('2d')
    context.drawImage(img, 0, 0)
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
    const light = (x, y) => {
      const i = 4 * (y * width + x)
      return (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
    }
    let top = -1
    let bottom = -1
    let ink = 0
    let arm = 0
    for (let y = 0; y < height; y += 1) {
      let first = -1
      let last = -1
      for (let x = 0; x < width; x += 1) {
        if (light(x, y) > 0.3) { if (first < 0) first = x; last = x }
      }
      if (first < 0) continue
      let rowInk = 0
      for (let x = first; x <= last; x += 1) if (light(x, y) < 0.2) rowInk += 1
      arm += last - first + 1
      ink += rowInk
      // A few pixels, not one: a stray dark speck is not a line of the design.
      if (rowInk >= 3) { if (top < 0) top = y; bottom = y }
    }
    return {
      width, height,
      heightShare: top < 0 ? 0 : (bottom - top + 1) / height,
      coverage: arm ? ink / arm : 0,
    }
  })
}

// The variant that Save just added, expanded, and its full-size image.
async function savedPicture(page, title) {
  await page.getByRole('button', { name: new RegExp(`^Expand ${title} result`) }).tap()
  const image = viewer(page).getByAltText(`${title} result`)
  await expect(image).toBeVisible()
  return image
}

test('a saved result opens on the 3D arm, a pinch resizes it in centimetres, and Save adds a variant', async ({ page }) => {
  const { drawer, view, mid } = await openOnArm(page)
  // The stored design, at its own shape (600 x 760), not a demo stand-in.
  await expect(drawer.getByRole('heading', { name: 'Moth line study' })).toBeVisible()
  await expect(size(page)).toContainText('12.0 cm wide × 15.2 cm tall')
  expect(await isOnTop(drawer.getByRole('button', { name: 'Save as variant' }))).toBe(true)

  // One finger turns the arm and leaves the size alone.
  const before = await view.screenshot()
  await swipe(page, mid, [mid[0] + 60, mid[1]])
  await expect.poll(async () => (await view.screenshot()).equals(before)).toBe(false)
  await expect(size(page)).toContainText('12.0 cm wide')

  const [x, y] = mid
  await twoFinger(page, [[x - 40, y], [x + 40, y]], [[x - 50, y], [x + 50, y]])
  await expect(size(page)).toContainText('15.0 cm wide × 19.0 cm tall')

  await drawer.getByRole('button', { name: 'Save as variant' }).tap()
  await expect(drawer).toBeHidden()
  await expect(viewer(page)).toBeVisible()
  await expect(resultCount(page)).toHaveText('2 results')

  const image = await savedPicture(page, 'On the arm, 15 cm')
  const ink = await measureInk(image)
  expect(ink.width).toBeGreaterThan(300)
  // The tattoo is the subject: it runs most of the picture's height.
  expect(ink.heightShare).toBeGreaterThan(0.5)
  expect(ink.coverage).toBeGreaterThan(0.01)
  await expect(viewer(page).getByText(/^3D arm preview of Moth line study\. 15\.0 cm wide × 19\.0 cm tall/)).toBeVisible()

  // Staged first: state holds the stored key, never the picture's own bytes.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tattoo_concepts'))[0].variants
    .find((variant) => variant.title === 'On the arm, 15 cm'))
  expect(saved.provider).toBe('other')
  expect(JSON.stringify(saved.imageUrl)).toMatch(/user\//)
  expect(JSON.stringify(saved)).not.toContain('data:image')
})

test('the saved picture is framed on the tattoo even from the whole-arm view, turned away', async ({ page }) => {
  const { drawer, mid } = await openOnArm(page)
  await drawer.getByRole('button', { name: 'Whole arm' }).tap()
  await expect(drawer.getByRole('button', { name: 'Close up' })).toHaveAttribute('aria-pressed', 'true')
  // Most of half a turn: the design is now round the back.
  await swipe(page, [mid[0] - 150, mid[1]], [mid[0] + 150, mid[1]], 16)

  await drawer.getByRole('button', { name: 'Save as variant' }).tap()
  await expect(drawer).toBeHidden()
  await expect(resultCount(page)).toHaveText('2 results')
  const ink = await measureInk(await savedPicture(page, 'On the arm, 12 cm'))
  expect(ink.heightShare).toBeGreaterThan(0.5)
  expect(ink.coverage).toBeGreaterThan(0.01)
})

test('Escape closes only the 3D drawer', async ({ page }) => {
  const { drawer } = await openOnArm(page)
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(page).not.toHaveURL(/layer=arm/)
  await expect(viewer(page)).toBeVisible()
  await expect(viewer(page).getByRole('heading', { name: 'AI Results' })).toBeVisible()
  await expect(resultCount(page)).toHaveText('1 result')
})

// Reopened straight after Escape, Back lands before the reopen's history
// entry has rendered: it must still close the drawer (useHistoryLayer listens
// for popstate, not only for the param leaving the rendered URL).
test('Escape, reopen at once, then Back closes the reopened drawer', async ({ page }) => {
  const { drawer } = await openOnArm(page)
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await page.getByRole('button', { name: /on the arm in 3D$/ }).tap()
  await expect(drawer).toBeVisible()
  await page.goBack()
  await expect(drawer).toBeHidden()
  await expect(viewer(page)).toBeVisible()
  await expect(page).toHaveURL(/\?concept=e2e-concept-1$/)
})

test('Back closes only the 3D drawer', async ({ page }) => {
  const { drawer } = await openOnArm(page)
  await expect(page).toHaveURL(/\?concept=e2e-concept-1&layer=arm$/)
  await page.goBack()
  await expect(drawer).toBeHidden()
  await expect(viewer(page)).toBeVisible()
  await expect(page).toHaveURL(/\?concept=e2e-concept-1$/)
})

test('the controls are finger-sized and the drawer fits the phone', async ({ page }) => {
  await openDemo(page, '/concepts', { concepts: [CONCEPT] })
  await openResult(page)
  const action = page.getByRole('button', { name: /on the arm in 3D$/ })
  expect((await action.boundingBox()).height).toBeGreaterThanOrEqual(44)
  await action.tap()
  const drawer = page.getByRole('dialog', { name: 'On the arm in 3D' })
  await expect(drawer.getByRole('button', { name: 'Whole arm' })).toBeVisible({ timeout: 20_000 })
  for (const name of ['Close', 'Whole arm', 'Save as variant']) {
    const box = await drawer.getByRole('button', { name }).boundingBox()
    expect(box.height, name).toBeGreaterThanOrEqual(44)
  }
  for (const name of ['Width', 'Above the elbow', 'Round the arm']) {
    expect((await drawer.getByLabel(name).boundingBox()).height, name).toBeGreaterThanOrEqual(44)
  }
  // Nothing spills sideways, and Save is on screen without scrolling.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const { width, height } = page.viewportSize()
  const save = await drawer.getByRole('button', { name: 'Save as variant' }).boundingBox()
  expect(save.x).toBeGreaterThanOrEqual(0)
  expect(save.x + save.width).toBeLessThanOrEqual(width)
  expect(save.y + save.height).toBeLessThanOrEqual(height)
})

test('three.js loads when the drawer opens, not with the Concepts page', async ({ page }) => {
  const scripts = []
  page.on('request', (request) => { if (request.resourceType() === 'script') scripts.push(request.url()) })
  const is3d = (url) => /ArmPlacement3D/.test(url)
  await openDemo(page, '/concepts', { concepts: [CONCEPT] })
  await openResult(page)
  await page.waitForLoadState('networkidle')
  expect(scripts.length).toBeGreaterThan(0)
  expect(scripts.filter(is3d)).toEqual([])

  await page.getByRole('button', { name: /on the arm in 3D$/ }).tap()
  await expect(page.getByTestId('arm-placement-3d').locator('canvas')).toBeVisible({ timeout: 20_000 })
  expect(scripts.filter(is3d).length).toBeGreaterThan(0)
})
