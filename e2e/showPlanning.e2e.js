import { test, expect, openDemo } from './fixtures'

// #190 on the phone: the Worth the trip line on each Radar card, and Top
// picks in walking order over the Big London 2026 floor plan. The demo gallery
// is fictional, so 2026's route is the field guide's picks; that is enough to
// see the layout, the Elsewhere group and Copy route.

const noSideScroll = (page) => page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth)
const VERDICT = /^(Worth the trip|Maybe|Skip it|Too early to say)$/

for (const width of [440, 320]) {
  test(`shows a trip verdict and walks Top picks across the floor (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 956 })
    await openDemo(page, '/conventions')

    // Every card is on an edition still to come today, so each has a verdict.
    await expect(page.getByText(VERDICT).first()).toBeVisible()
    expect(await page.getByText(VERDICT).count()).toBeGreaterThanOrEqual(5)
    expect(await noSideScroll(page)).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`radar-verdicts-${width}.png`) })

    const card = page.locator('#convention-big-london')
    await card.getByRole('button', { name: /2026/ }).tap()
    await expect(card.getByText(VERDICT)).toHaveCount(0)
    await card.getByRole('button', { name: /artist index/i }).tap()
    await card.getByRole('button', { name: 'Top picks' }).tap()
    const walking = card.getByRole('button', { name: 'Walking order' })
    await walking.tap()

    const route = card.getByRole('list', { name: 'Route' })
    await expect(route).toBeVisible()
    await expect(route.getByText('Stop 1', { exact: false }).first()).toBeVisible()
    await expect(card.getByRole('heading', { name: 'Elsewhere in the hall' })).toBeVisible()
    const copy = card.getByRole('button', { name: 'Copy route' })
    for (const target of [walking, card.getByRole('button', { name: 'Ranked' }), copy]) {
      expect((await target.boundingBox()).height).toBeGreaterThanOrEqual(44)
    }
    expect(await noSideScroll(page)).toBe(true)
    await route.scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath(`walking-order-${width}.png`) })
  })
}
