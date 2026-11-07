import { randomId } from './randomId'

const CRLF = '\r\n'
const encoder = new TextEncoder()

function escapeText(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function dateParts(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid calendar date')
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid calendar date')
  return date
}

function dateValue(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

function timestamp(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('Invalid calendar time')
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

// Fold by UTF-8 octets, not JavaScript string length; never divide a code point.
function fold(line) {
  const lines = ['']
  let bytes = 0
  for (const glyph of line) {
    const size = encoder.encode(glyph).length
    if (bytes + size > 75) {
      lines.push(' ')
      bytes = 1
    }
    lines[lines.length - 1] += glyph
    bytes += size
  }
  return lines.join(CRLF)
}

/** Build an offline RFC 5545 calendar. Date-only events are inclusive in input. */
export function buildIcs(events, { now = new Date(), idFactory = randomId } = {}) {
  if (!Array.isArray(events) || events.length === 0) throw new Error('No calendar events')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sable//Calendar Export//EN', 'CALSCALE:GREGORIAN']
  const stamp = timestamp(now)
  for (const event of events) {
    if (!event || typeof event.title !== 'string' || !event.title.trim()) throw new Error('Invalid calendar event')
    let start
    let end
    if (event.startDate || event.endDate) {
      const first = dateParts(event.startDate)
      const last = dateParts(event.endDate)
      if (last < first) throw new Error('Invalid calendar date range')
      last.setUTCDate(last.getUTCDate() + 1)
      start = `DTSTART;VALUE=DATE:${dateValue(first)}`
      end = `DTEND;VALUE=DATE:${dateValue(last)}`
    } else {
      const first = new Date(event.startAt)
      const last = new Date(event.endAt)
      if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || last <= first) throw new Error('Invalid calendar time range')
      start = `DTSTART:${timestamp(first)}`
      end = `DTEND:${timestamp(last)}`
    }
    lines.push('BEGIN:VEVENT', `UID:${idFactory()}@sable.local`, `DTSTAMP:${stamp}`, `SUMMARY:${escapeText(event.title)}`)
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`)
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`)
    lines.push(start, end, 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(fold).join(CRLF)}${CRLF}`
}

// Initiation of a download is observable; Safari consumption is not.
export function requestCalendarDownload(ics, filename) {
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  try {
    link.href = url
    link.download = filename
    document.body.append(link)
    link.click()
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  } finally {
    link.remove()
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
