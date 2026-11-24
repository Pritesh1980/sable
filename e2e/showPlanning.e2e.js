import { test, expect, openDemo } from './fixtures'

// #190 on the phone: the Worth the trip line on each Radar card, and Top
// picks in walking order over the Big London 2026 floor plan. The demo gallery
// is fictional, so 2026's route is the field guide's picks; that is enough to
// see the layout, the Elsewhere group and Copy route.

const noSideScroll = (page) => page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth)
const VERDICT = /^(Worth the trip|Maybe|Skip it)$/

for (const width of [440, 320]) {
  test(`shows a trip verdict and walks Top picks across the floor (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 956 })
    // Pinned to Nov 2026, so the 2027 editions are the ones still to come.
    await page.clock.setFixedTime(new Date('2026-11-20T12:00:00'))
    await openDemo(page, '/conventions')

    // Nothing to go on yet, so no card has a verdict until someone is marked going.
    await expect(page.getByRole('heading', { name: 'Convention Radar' })).toBeVisible()
    await expect(page.getByText(VERDICT)).toHaveCount(0)
    const hero = page.locator('#convention-uk-tattoo-fest')
    await hero.getByRole('button', { name: 'Edit' }).tap()
    await hero.getByRole('button', { name: /Mora Vane/ }).tap()
    await expect(hero.getByText('Worth the trip')).toBeVisible()
    await expect(hero.getByText(/1 of your artists, #\d+ · on your doorstep/)).toBeVisible()
    expect(await noSideScroll(page)).toBe(true)
    await hero.getByText('Worth the trip').scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath(`radar-verdict-${width}.png`) })

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
