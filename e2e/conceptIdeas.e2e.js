import { test, expect, openConceptIdeaFixture, openConceptIdeaVariant, centre, isOnTop } from './fixtures'

const storedIdeas = page => page.evaluate(() => JSON.parse(localStorage.getItem('tattoo_ideas') || '[]'))
const imageReady = page => expect.poll(() => page.locator('img').evaluateAll(images =>
  images.some(image => image.src.startsWith('data:image/') && image.complete && image.naturalWidth > 0))).toBe(true)

test('a chosen non-Best variant becomes a ready unsaved draft, then survives save, reload and source deletion', async ({ page }) => {
  await openConceptIdeaFixture(page)
  await openConceptIdeaVariant(page)
  // Duplicate activation in one event turn still creates only one draft.
  await page.getByRole('button', { name: 'Create idea' }).evaluate(button => { button.click(); button.click() })
  await expect(page.getByPlaceholder('Idea title…')).toHaveValue('Moonlit temple study')
  await expect(page.getByPlaceholder('Describe the concept, mood, imagery…')).toHaveValue('Moonlit temple study\n\nChosen arm placement\n\nLeave room around the wrist')
  await expect(page.getByPlaceholder('What to borrow from this image…')).toHaveValue('3D arm preview')
  await imageReady(page)
  expect(await storedIdeas(page)).toHaveLength(1)
  const chosenBytes = await page.evaluate(async () => Array.from(new Uint8Array(await (await fetch(new URL('images/demo/hexen_atlas/temple-v4.webp', location.origin + '/'))).arrayBuffer())))
  const copiedBytes = await page.locator('img').filter({ visible: true }).first().evaluate(async img => Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer())))
  expect(copiedBytes).toEqual(chosenBytes)
  await page.getByRole('button', { name: 'Save', exact: true }).tap()
  await expect.poll(async () => (await storedIdeas(page)).length).toBe(2)
  const saved = (await storedIdeas(page)).find(idea => idea.title === 'Moonlit temple study')
  expect(saved.images[0].key).toContain(`/ideas/${saved.id}/`)
  expect(JSON.stringify(saved)).not.toContain('data:')
  // Away from the mounted app, remove the source from both local-backend copies.
  await page.goto('/manifest.json')
  await page.evaluate(() => {
    const user = JSON.parse(localStorage.getItem('tattoo_local_session')).user
    localStorage.setItem('tattoo_concepts', '[]')
    localStorage.setItem(`tattoo_remote_${user.id}_concepts`, '[]')
  })
  await page.goto('/brief')
  await page.getByText('Moonlit temple study', { exact: true }).click()
  await imageReady(page)
  await expect(page.getByPlaceholder('What to borrow from this image…')).toHaveValue('3D arm preview')
})

test('original attachment keeps existing metadata and cannot bounce back to Concepts', async ({ page }) => {
  await openConceptIdeaFixture(page)
  await page.touchscreen.tap(...centre(page))
  await page.getByRole('button', { name: 'Use in idea: original' }).tap()
  await page.getByRole('button', { name: 'Add to existing idea' }).tap()
  await page.getByRole('searchbox', { name: 'Search ideas' }).fill('forearm')
  await page.getByRole('button', { name: 'Existing forearm plan' }).tap()
  await page.getByRole('textbox', { name: 'Reference note' }).fill('Original AI design')
  await page.getByRole('button', { name: 'Add image to idea' }).tap()
  await expect(page.getByPlaceholder('Idea title…')).toHaveValue('Existing forearm plan')
  await imageReady(page)
  const [idea] = await storedIdeas(page)
  expect(idea.description).toBe('Keep this description')
  expect(idea.images).toHaveLength(2)
  expect(idea.images[0]).toMatchObject({ note: 'Existing reference', briefCrop: { x: 1, y: 0, zoom: 2 } })
  expect(idea.images[1]).toMatchObject({ key: expect.stringContaining('/ideas/existing-bridge-idea/'), note: 'Original AI design' })
  await page.getByRole('button', { name: '← Back' }).tap()
  await expect(page).toHaveURL(/\/brief$/)
})

for (const width of [320, 430]) {
  test(`picker at ${width}px has usable targets, returns focus and peels one history layer`, async ({ page }) => {
    await page.setViewportSize({ width, height: 920 })
    await openConceptIdeaFixture(page)
    await openConceptIdeaVariant(page)
    const dialog = page.getByRole('dialog', { name: 'Use in idea', exact: true })
    expect(await dialog.evaluate(node => node.scrollWidth <= innerWidth)).toBe(true)
    for (const name of ['Create idea', 'Cancel', 'New idea', 'Add to existing idea']) {
      const target = dialog.getByRole('button', { name, exact: true })
      const box = await target.boundingBox()
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(await isOnTop(target)).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    const opener = page.getByRole('button', { name: 'Use in idea: 3D arm preview' })
    await expect(opener).toBeFocused()
    await opener.tap()
    await expect(dialog).toBeVisible()
    await page.goBack()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: /^Concept:/ })).toBeVisible()
  })
}

test('discarding a transferred draft and returning through history does not reopen or save it', async ({ page }) => {
  await openConceptIdeaFixture(page)
  await openConceptIdeaVariant(page)
  await page.getByRole('button', { name: 'Create idea' }).tap()
  await page.getByPlaceholder('Idea title…').waitFor()
  await page.getByRole('button', { name: '← Back' }).tap()
  await page.goBack()
  await page.goForward()
  await expect(page).toHaveURL(/\/brief$/)
  await expect(page.getByPlaceholder('Idea title…')).toHaveCount(0)
  expect(await storedIdeas(page)).toHaveLength(1)
})
