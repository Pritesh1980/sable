import { test, expect, openDemo } from './fixtures'

test('downloads an all-day show event for the visible 2027 edition', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-07T12:00:00Z'))
  await page.addInitScript(() => {
    const original = URL.createObjectURL
    URL.createObjectURL = function (blob) {
      if (blob.type.startsWith('text/calendar')) window.__calendarBlobType = blob.type
      return original.call(this, blob)
    }
  })
  await openDemo(page, '/conventions')
  const card = page.getByRole('heading', { name: 'UK Tattoo Fest' }).locator('xpath=ancestor::div[contains(@class,"animate-slide-up")]')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    card.getByRole('button', { name: 'Add to calendar' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('sable-uk-tattoo-fest-2027.ics')
  expect(await page.evaluate(() => window.__calendarBlobType)).toBe('text/calendar;charset=utf-8')
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  const ics = Buffer.concat(chunks).toString('utf8')
  expect(ics).toContain('DTSTART;VALUE=DATE:20270313\r\n')
  expect(ics).toContain('DTEND;VALUE=DATE:20270315\r\n')
  expect(ics).toContain('SUMMARY:UK Tattoo Fest\r\n')
  expect(ics).toContain('LOCATION:Marshall Arena\\, Milton Keynes\r\n')
})
