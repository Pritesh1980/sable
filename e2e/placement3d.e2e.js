import { test, expect, openDemo, swipe, twoFinger } from './fixtures'

// The 3D placement lab (#195 spike): a real glTF arm in real WebGL with real
// touch points. jsdom has no WebGL, so only this proves the model loads, a
// finger turns it and a pinch resizes the design.

const size = (page) => page.getByTestId('placement-size')

async function openLab(page) {
  await openDemo(page, '/lab/placement')
  await expect(page.getByText('Loading the arm…')).toHaveCount(0, { timeout: 20_000 })
  const view = page.getByTestId('arm-placement-3d')
  await expect(view.locator('canvas')).toBeVisible()
  // A design of known shape (600 x 760), so the sizes below are exact.
  await page.getByLabel('Design').selectOption({ label: 'Serpent (blackwork card)' })
  const box = await view.boundingBox()
  return { view, mid: [box.x + box.width / 2, box.y + box.height / 2] }
}

test('the arm loads at true size and one finger turns it', async ({ page }) => {
  const { view, mid } = await openLab(page)
  await expect(size(page)).toContainText('12.0 cm wide × 15.2 cm tall')
  const before = await view.screenshot()
  await swipe(page, mid, [mid[0] + 120, mid[1]])
  await expect.poll(async () => (await view.screenshot()).equals(before)).toBe(false)
  // Turning the arm is not resizing the design.
  await expect(size(page)).toContainText('12.0 cm wide')
})

test('the view opens on the tattoo, and steps back to the whole arm on request', async ({ page }) => {
  const { view } = await openLab(page)
  const toggle = page.getByRole('button', { name: 'Whole arm' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  // Let the opening framing settle before comparing pictures.
  let closeUp = await view.locator('canvas').screenshot()
  await expect.poll(async () => {
    const next = await view.locator('canvas').screenshot()
    const settled = next.equals(closeUp)
    closeUp = next
    return settled
  }).toBe(true)
  await toggle.tap()
  await expect(page.getByRole('button', { name: 'Close up' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await view.locator('canvas').screenshot()).equals(closeUp)).toBe(false)
})

test('a pinch resizes the design, in centimetres', async ({ page }) => {
  const { mid } = await openLab(page)
  const [x, y] = mid
  await twoFinger(page, [[x - 40, y], [x + 40, y]], [[x - 60, y], [x + 60, y]])
  await expect(size(page)).toContainText('18.0 cm wide')
  // A design can never go the whole way round: however far the fingers
  // spread (7.5 times here), the width stops at 90% of the thinnest part of
  // the arm it covers.
  await twoFinger(page, [[x - 20, y], [x + 20, y]], [[x - 150, y], [x + 150, y]])
  await expect(size(page)).not.toContainText('18.0 cm wide')
  const [, width, share] = (await size(page).textContent()).match(/^([\d.]+) cm wide.*?(\d+)% round/)
  expect(Number(width)).toBeGreaterThan(18)
  expect(Number(width)).toBeLessThan(28)
  expect(Number(share)).toBeLessThanOrEqual(90)
})

// #206: a second model, switched to in place.
test('the forearm loads from the switch, at its own true size, and a finger turns it', async ({ page }) => {
  const { view, mid } = await openLab(page)
  await expect(size(page)).toContainText('12.0 cm wide')
  const upper = await view.locator('canvas').screenshot()
  const switcher = page.getByRole('group', { name: 'Limb' })
  await switcher.getByRole('button', { name: 'Forearm' }).tap()
  await expect(switcher.getByRole('button', { name: 'Forearm' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Loading the arm…')).toHaveCount(0, { timeout: 20_000 })
  // The forearm's own default and words: 8 cm wide on 600 x 760, above the wrist.
  await expect(size(page)).toContainText('8.0 cm wide × 10.1 cm tall')
  await expect(page.getByLabel('Above the wrist')).toBeVisible()
  await expect(page.getByLabel('Round the arm')).toHaveAttribute('aria-valuetext', 'inner forearm')
  await expect.poll(async () => (await view.locator('canvas').screenshot()).equals(upper)).toBe(false)
  const before = await view.locator('canvas').screenshot()
  await swipe(page, mid, [mid[0] + 120, mid[1]])
  await expect.poll(async () => (await view.locator('canvas').screenshot()).equals(before)).toBe(false)
})

test('the 3D chunk stays out of the rest of the app', async ({ page }) => {
  const scripts = []
  page.on('request', (request) => { if (request.resourceType() === 'script') scripts.push(request.url()) })
  await openDemo(page, '/concepts')
  await page.waitForLoadState('networkidle')
  expect(scripts.length).toBeGreaterThan(0)
  expect(scripts.filter((url) => /ArmPlacement3D|PlacementLab/.test(url))).toEqual([])
})
