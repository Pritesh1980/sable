import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

it('keeps the Instagram capture guide and in-app Help aligned', () => {
  const guide = readFileSync('docs/02-managing-artists.md', 'utf8')
  const help = readFileSync('src/pages/Help.jsx', 'utf8')
  expect(guide).toContain('artist-capture.png')
  expect(help).toContain('artist-capture.png')
  expect(guide).toContain('Share from Instagram')
  expect(readFileSync('src/pages/Settings.jsx', 'utf8')).toContain('#share-from-instagram')
  for (const file of ['artist-capture', 'settings', 'help-overview']) {
    const png = readFileSync(`public/guide/${file}.png`)
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([430, 920])
  }
})
