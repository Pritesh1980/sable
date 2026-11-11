import { test, expect, openDemo, isOnTop } from './fixtures'

// #206: a Brief idea's reference photo on the 3D arm, opened on the limb the
// idea is planned for, with the picture it takes added to the references.
// Real WebGL and touch: ideaArmPlacement.test.jsx covers the wiring in jsdom.

async function openHourglass(page) {
  await openDemo(page, '/brief')
  await page.getByText('Ocean in an hourglass').first().click()
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeAttached()
}
const references = (page) => page.getByRole('button', { name: /^View reference \d+ on the arm in 3D$/ })

test('a forearm idea opens its photo on the forearm, over the editor, and adds the picture', async ({ page }) => {
  await openHourglass(page)
  await expect(references(page)).toHaveCount(1)
  const open = page.getByRole('button', { name: 'View reference 1 on the arm in 3D' })
  await expect(open).toBeVisible() // no hover on a phone: always shown
  await open.tap()

  const drawer = page.getByRole('dialog', { name: 'On the arm in 3D' })
  await expect(drawer.getByRole('heading', { name: 'Ocean in an hourglass reference 1' })).toBeVisible()
  await expect(drawer.getByRole('group', { name: 'Limb' }).getByRole('button', { name: 'Forearm' }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(drawer.getByText('Loading the arm…')).toHaveCount(0, { timeout: 20_000 })
  await expect(drawer.getByTestId('placement-size')).toContainText('cm wide')
  const add = drawer.getByRole('button', { name: 'Add to references' })
  await expect(add).toBeEnabled({ timeout: 20_000 })
  expect(await isOnTop(add)).toBe(true)

  await add.tap()
  await expect(drawer).toHaveCount(0)
  // Back in the editor, with the picture as a second reference.
  await expect(references(page)).toHaveCount(2)
  await page.getByRole('button', { name: /^Save/ }).first().tap()
  // Saved as a staged photo noted with its size, never as inline base64.
  await expect.poll(() => page.evaluate(() => {
    const idea = JSON.parse(localStorage.getItem('tattoo_ideas') || '[]')
      .find((i) => i.title === 'Ocean in an hourglass')
    return idea?.images?.[1] ?? null
  })).toMatchObject({ key: expect.stringMatching(/^user\//), note: expect.stringMatching(/^On the forearm, [\d.]+ cm$/) })
})

test('Escape closes only the 3D drawer, leaving the idea open', async ({ page }) => {
  await openHourglass(page)
  await page.getByRole('button', { name: 'View reference 1 on the arm in 3D' }).tap()
  await expect(page.getByRole('dialog', { name: 'On the arm in 3D' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'On the arm in 3D' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible()
})
