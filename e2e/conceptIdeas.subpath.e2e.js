import { test, expect, openConceptIdeaFixture, openConceptIdeaVariant } from './fixtures'

test('a concept variant opens a ready Idea draft under /sable/', async ({ page }) => {
  await openConceptIdeaFixture(page, { base: '/sable/' })
  await openConceptIdeaVariant(page)
  await page.getByRole('button', { name: 'Create idea' }).tap()
  await expect(page).toHaveURL(/\/sable\/brief$/)
  await expect(page.getByPlaceholder('Idea title…')).toHaveValue('Moonlit temple study')
  await expect.poll(() => page.locator('img').evaluateAll(images => images.some(image => image.src.startsWith('data:image/') && image.complete && image.naturalWidth > 0))).toBe(true)
})
