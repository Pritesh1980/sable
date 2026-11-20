import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Artist status (researching → contact next → pass) was removed from the app
// (#220 D): the owner does not work through a contact chain. Records keep the
// stored `status` value, so backups and sync carry it, but no code may show it
// or let it change behaviour. An invisible Pass that still hid an artist from
// Nearby soon or sank them in idea matches could never be undone.
const SRC = join(process.cwd(), 'src')

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'test' ? [] : sourceFiles(path)
    return /\.(js|jsx)$/.test(name) ? [path] : []
  })
}

const FORBIDDEN = [
  /ARTIST_STATUSES/,
  /normalizeArtistStatus/,
  /'contact-next'/,
  /Shortlist status/,
  /\bartist\??\.status\b/,
]

describe('artist status is gone from the code', () => {
  it('no source file reads or shows it', () => {
    const hits = []
    for (const file of sourceFiles(SRC)) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (FORBIDDEN.some((re) => re.test(line))) hits.push(`${file.slice(SRC.length + 1)}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(hits).toEqual([])
  })
})
