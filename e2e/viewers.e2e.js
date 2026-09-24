import { test, expect, openDemo, openResult, swipe, centre, isOnTop, DEMO_CONCEPT, SECOND_CONCEPT } from './fixtures'

// The two full-screen viewers on a touch screen (#93): swipe between images,
// tap to show the controls, swipe down or tap Close to leave. Unit tests fake
// the gesture classifier's input; this drives real touch points through
// Chromium's pointer pipeline, where `touch-action` decides what we ever see.

const LEFT = ([x, y]) => [[x + 120, y], [x - 120, y]]
const RIGHT = ([x, y]) => [[x - 120, y], [x + 120, y]]
const UP = ([x, y]) => [[x, y + 150], [x, y - 150]]
const DOWN = ([x, y]) => [[x, y - 150], [x, y + 150]]

const imageLabel = /^(.+) — image (\d+) of (\d+)$/

test.describe('wall viewer', () => {
  test('swipes through images and artists, taps for controls, swipes down to close', async ({ page }) => {
    await openDemo(page, '/')
    await page.getByRole('figure', { name: 'Mora Vane' }).first().click()
    const viewer = page.getByRole('dialog', { name: imageLabel })
    await expect(viewer).toBeVisible()
    const start = (await viewer.getAttribute('aria-label')).match(imageLabel)

    await swipe(page, ...LEFT(centre(page)))
    await expect(viewer).not.toHaveAttribute('aria-label', start[0])
    await expect(viewer).toHaveAttribute('aria-label', new RegExp(`^${start[1]} — image`))

    await swipe(page, ...RIGHT(centre(page)))
    await expect(viewer).toHaveAttribute('aria-label', start[0])

    await swipe(page, ...UP(centre(page)))
    await expect(viewer).not.toHaveAttribute('aria-label', new RegExp(`^${start[1]} — `))

    await page.touchscreen.tap(...centre(page))
    await expect(page.getByRole('button', { name: /Next artist/ })).toBeVisible()
    await page.touchscreen.tap(...centre(page))
    await expect(page.getByRole('button', { name: /Next artist/ })).toBeHidden()

    await swipe(page, ...DOWN(centre(page)))
    await expect(viewer).toBeHidden()
  })

  test('the Close button is on top and closes it', async ({ page }) => {
    await openDemo(page, '/')
    await page.getByRole('figure', { name: 'Vesper Ash' }).first().click()
    const close = page.getByRole('button', { name: 'Close viewer' })
    expect(await isOnTop(close)).toBe(true)
    await close.tap()
    await expect(page.getByRole('dialog', { name: imageLabel })).toBeHidden()
  })
})

test.describe('concept viewer', () => {
  test.beforeEach(async ({ page }) => {
    await openDemo(page, '/concepts', { concepts: [SECOND_CONCEPT, DEMO_CONCEPT] })
  })

  test('swipes between concepts and closes on swipe down', async ({ page }) => {
    await page.getByRole('figure', { name: /Fern spiral/ }).click()
    await expect(page.getByRole('dialog', { name: 'Concept: Fern spiral with seed heads' })).toBeVisible()

    await swipe(page, ...LEFT(centre(page)))
    const moth = page.getByRole('dialog', { name: 'Concept: Moth over a crescent moon' })
    await expect(moth).toBeVisible()

    await swipe(page, ...DOWN(centre(page)))
    await expect(moth).toBeHidden()
  })

  test('delete from the viewer can be undone', async ({ page }) => {
    await page.getByRole('figure', { name: /Moth over/ }).click()
    await page.touchscreen.tap(...centre(page))
    await page.getByRole('button', { name: 'Delete' }).tap()

    await expect(page.getByRole('figure', { name: /Moth over/ })).toBeHidden()
    const undo = page.getByRole('button', { name: 'Undo' })
    expect(await isOnTop(undo)).toBe(true)
    await undo.tap()
    await expect(page.getByRole('figure', { name: /Moth over/ })).toBeVisible()
    // The restore is durable: it survives a reload, not just this render.
    await page.reload()
    await expect(page.getByRole('figure', { name: /Moth over/ })).toBeVisible()
  })
})

test.describe('drawers over the concept viewer', () => {
  test.beforeEach(async ({ page }) => {
    await openDemo(page, '/concepts', { concepts: [DEMO_CONCEPT] })
    await openResult(page)
  })

  const viewer = (page) => page.getByRole('dialog', { name: /^Concept: Moth/ })

  test('the STL drawer opens on top, and Escape closes only it', async ({ page }) => {
    await page.getByRole('button', { name: /^Make STL from/ }).tap()
    const drawer = page.getByRole('dialog', { name: 'Make Relief STL' })
    await expect(drawer).toBeVisible()
    expect(await isOnTop(page.getByRole('button', { name: 'Download STL' }))).toBe(true)

    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(viewer(page)).toBeVisible()
    // And with the drawer gone, the viewer is the top layer again.
    await page.keyboard.press('Escape')
    await expect(viewer(page)).toBeHidden()
  })

  test('the try-on drawer and live camera stack, and Escape peels one layer at a time', async ({ page }) => {
    await page.getByRole('button', { name: /on skin$/ }).tap()
    const drawer = page.getByRole('dialog', { name: 'Try on skin' })
    await expect(drawer).toBeVisible()
    expect(await isOnTop(drawer.getByRole('button', { name: /live camera/i }))).toBe(true)

    await drawer.getByRole('button', { name: /live camera/i }).tap()
    const live = page.getByRole('dialog', { name: 'Live try-on' })
    await expect(live).toBeVisible()
    expect(await isOnTop(page.getByRole('button', { name: 'Close live try-on' }))).toBe(true)

    await page.keyboard.press('Escape')
    await expect(live).toBeHidden()
    await expect(drawer).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(viewer(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(viewer(page)).toBeHidden()
  })
})
