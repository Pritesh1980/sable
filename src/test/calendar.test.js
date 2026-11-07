import { describe, expect, it } from 'vitest'
import { buildIcs } from '../data/calendar'

const fixed = { now: new Date('2026-11-07T12:34:56Z'), idFactory: () => 'fixture-id' }
const event = {
  title: 'Tattoo Freeze', location: 'Telford International Centre',
  startDate: '2027-01-30', endDate: '2027-01-31',
  description: 'https://www.tattoofreeze.com/\nSeeing: @zoia.ink',
}

describe('buildIcs', () => {
  it('matches a complete golden all-day event', () => {
    expect(buildIcs([event], fixed)).toBe([
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sable//Calendar Export//EN', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT', 'UID:fixture-id@sable.local', 'DTSTAMP:20261107T123456Z',
      'SUMMARY:Tattoo Freeze', 'LOCATION:Telford International Centre',
      'DESCRIPTION:https://www.tattoofreeze.com/\\nSeeing: @zoia.ink',
      'DTSTART;VALUE=DATE:20270130', 'DTEND;VALUE=DATE:20270201',
      'END:VEVENT', 'END:VCALENDAR', '',
    ].join('\r\n'))
  })

  it('escapes text and folds UTF-8 lines at 75 octets without splitting a glyph', () => {
    const text = buildIcs([{ ...event, title: `Ink, art; \\ and\n${'🐉'.repeat(32)}` }], fixed)
    const lines = text.split('\r\n')
    expect(lines.every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true)
    expect(text).toContain('SUMMARY:Ink\\, art\\; \\\\ and\\n')
    expect(text.replace(/\r\n /g, '')).toContain('🐉'.repeat(32))
    expect(text).not.toMatch(/(?<!\r)\n/)
  })

  it('uses an exclusive end across leap day and rejects unknown dates', () => {
    const leap = buildIcs([{ ...event, startDate: '2028-02-29', endDate: '2028-02-29' }], fixed)
    expect(leap).toContain('DTEND;VALUE=DATE:20280301')
    expect(() => buildIcs([{ ...event, startDate: null }], fixed)).toThrow()
    expect(() => buildIcs([{ ...event, startDate: '2027-02-30' }], fixed)).toThrow()
  })
})
