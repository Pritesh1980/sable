import { test, expect, openDemo } from './fixtures'

test('capture traps focus through the disclosure and restores it on Escape', async ({ page }) => {
  await openDemo(page, '/')
  const trigger = page.getByRole('button', { name: /^\+ Add artist$/i }).first()
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Add an artist' })
  await dialog.getByLabel('Instagram *').focus()
  await page.keyboard.press('Tab')
  await expect(dialog.locator('summary')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('link', { name: 'Full manage view' })).toBeFocused()
  await dialog.locator('summary').click()
  await page.keyboard.press('Tab')
  await expect(dialog.getByLabel('Display name')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
})
