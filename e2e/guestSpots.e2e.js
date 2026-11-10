import { readFileSync } from 'node:fs'
import { test, expect, openDemo } from './fixtures'

// Guest spots (#183): an announcement screenshot is read only on an explicit
// tap, every suggestion is reviewed before it is saved, and a saved spot near
// Milton Keynes shows on Pipeline. Gemini is mocked; the artist is fictional.
const announcement = { name: 'fictional-announcement.webp', mimeType: 'image/webp',
  buffer: readFileSync('public/images/demo/mora.blackfern/fern-v4.webp') }

const iso = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('reads a guest spot announcement, reviews it and shows it nearby soon', async ({ page }) => {
  const geminiCalls = []
  await page.route(/(api\.openai\.com|huggingface\.co)/, (route) => route.abort())
  await page.route(/generativelanguage\.googleapis\.com/, async (route) => {
    const request = route.request()
    geminiCalls.push({ url: request.url(), key: request.headers()['x-goog-api-key'] })
    const text = `Oxford | Lantern Studio | ${iso(10)} | ${iso(12)} | Books open Friday, DM to book\nLisbon | - | ${iso(30)} | ${iso(31)} | -`
    await route.fulfill({ json: { candidates: [{ content: { parts: [{ text }] } }] } })
  })

  await openDemo(page, '/gallery?artist=ashgrove.tattoo', { storage: { gemini_api_key: 'fictional-key' } })
  await page.getByLabel('Guest spot screenshot').setInputFiles(announcement)
  const read = page.getByRole('button', { name: 'Read dates' })
  await expect(read).toBeVisible()
  expect(geminiCalls).toHaveLength(0)

  await read.click()
  const suggestions = page.getByRole('list', { name: 'Suggested guest spots' })
  await expect(suggestions.getByRole('listitem')).toHaveCount(2)
  expect(geminiCalls).toHaveLength(1)
  expect(geminiCalls[0].url).not.toContain('key=')
  expect(geminiCalls[0].key).toBe('fictional-key')
  await expect(suggestions.getByText(/distance unknown/)).toBeVisible()
  await expect(page.getByAltText('Announcement screenshot')).toBeVisible()

  await suggestions.getByRole('button', { name: 'Review Oxford' }).click()
  await expect(page.getByLabel('City')).toHaveValue('Oxford')
  await expect(page.getByText('45 mi from Milton Keynes')).toBeVisible()
  await expect(page.getByLabel('Notes')).toHaveValue('Books open Friday, DM to book')
  await page.getByRole('button', { name: 'Save guest spot' }).click()

  const upcoming = page.getByRole('list', { name: 'Upcoming guest spots' })
  await expect(upcoming.getByText('Oxford')).toBeVisible()
  await expect(suggestions.getByRole('listitem')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.reload()
  await expect(page.getByRole('list', { name: 'Upcoming guest spots' }).getByText('Oxford')).toBeVisible()

  await page.goto('/pipeline')
  const nearby = page.getByRole('list', { name: 'Guest spots nearby soon' })
  await expect(nearby.getByText('@ashgrove.tattoo')).toBeVisible()
  await expect(nearby.getByText('Vesper Ash')).toBeVisible() // seeded demo spot in London
  await expect(nearby.getByText('Lisbon')).toHaveCount(0)
  await expect(nearby.getByText('Books open Friday, DM to book')).toBeVisible()

  // Tapping a row lands on the artist's Guest spots, not the top of their photos.
  await nearby.getByText('@ashgrove.tattoo').click()
  await expect(page.getByRole('list', { name: 'Upcoming guest spots' }).getByText('Oxford')).toBeInViewport()

  // Home: one line, however many spots are coming up.
  await page.goto('/')
  const strip = page.getByRole('link', { name: /Nearby soon/ })
  await expect(strip).toBeVisible()
  const box = await strip.boundingBox()
  expect(box.height).toBeLessThan(60)
  await expect(page.getByRole('link', { name: /^\+\d+ more$/ })).toHaveAttribute('href', /\/pipeline$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
