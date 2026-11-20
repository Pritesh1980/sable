import { describe, it, expect } from 'vitest'
import {
  MAX_HISTORY_ENTRIES,
  appendArtistHistory,
  movers,
  recordArtistHistoryOnEdit,
  statusDurations,
  styleShareByMonth,
  topNByMonth,
} from '../data/tasteHistory'

describe('appendArtistHistory & recordArtistHistoryOnEdit (#188)', () => {
  it('enforces one entry per day and caps history at 200 entries', () => {
    let history = []
    history = appendArtistHistory(history, { at: '2026-09-01T09:00:00.000Z', rank: 8, status: 'researching' })
    history = appendArtistHistory(history, { at: '2026-09-01T15:30:00.000Z', rank: 4, status: 'shortlisted' })
    expect(history).toEqual([{ at: '2026-09-01T15:30:00.000Z', rank: 4, status: 'shortlisted' }])

    history = appendArtistHistory(history, { at: '2026-09-02T10:00:00.000Z', rank: 2, status: 'contact-next' })
    expect(history).toHaveLength(2)

    let capped = []
    const baseMs = Date.parse('2026-01-01T12:00:00.000Z')
    for (let d = 0; d < 220; d += 1) {
      const iso = new Date(baseMs + d * 86_400_000).toISOString()
      capped = appendArtistHistory(capped, { at: iso, rank: (d % 10) + 1, status: 'researching' })
    }
    expect(capped).toHaveLength(MAX_HISTORY_ENTRIES)
    expect(capped[0].at).toBe(new Date(baseMs + 20 * 86_400_000).toISOString())
  })

  it('handles a whole-list rerank on the same day with at most one entry per artist', () => {
    const initial = [
      { id: 'a', rank: 1, status: 'shortlisted', history: [{ at: '2026-10-01T10:00:00.000Z', rank: 1, status: 'shortlisted' }] },
      { id: 'b', rank: 2, status: 'shortlisted', history: [{ at: '2026-10-01T10:00:00.000Z', rank: 2, status: 'shortlisted' }] },
      { id: 'c', rank: 3, status: 'researching', history: [{ at: '2026-10-01T10:00:00.000Z', rank: 3, status: 'researching' }] },
    ]
    const midDayOrder = [
      { ...initial[2], rank: 1 },
      { ...initial[0], rank: 2 },
      { ...initial[1], rank: 3 },
    ].map((next, i) => recordArtistHistoryOnEdit(initial[i].id === next.id ? initial[i] : initial.find((p) => p.id === next.id), next, '2026-10-15T11:00:00.000Z'))

    const laterSameDay = [
      { ...midDayOrder[1], rank: 1 },
      { ...midDayOrder[0], rank: 2 },
      { ...midDayOrder[2], rank: 3 },
    ].map((next) => {
      const prev = midDayOrder.find((p) => p.id === next.id)
      return recordArtistHistoryOnEdit(prev, next, '2026-10-15T18:00:00.000Z')
    })

    for (const artist of laterSameDay) {
      expect(artist.history).toHaveLength(2)
      expect(artist.history.map((e) => e.at.slice(0, 10))).toEqual(['2026-10-01', '2026-10-15'])
    }
    expect(laterSameDay.find((a) => a.id === 'a').history[1].rank).toBe(1)
  })
})

describe('topNByMonth, movers, styleShareByMonth & statusDurations (#188)', () => {
  const sample = [
    {
      id: 'vesper',
      handle: 'vesper',
      name: 'Vesper',
      tags: ['surrealism', 'realism'],
      rank: 1,
      status: 'contact-next',
      history: [
        { at: '2026-09-05T12:00:00.000Z', rank: 4, status: 'researching' },
        { at: '2026-10-10T12:00:00.000Z', rank: 2, status: 'shortlisted' },
        { at: '2026-11-05T12:00:00.000Z', rank: 1, status: 'contact-next' },
      ],
    },
    {
      id: 'mora',
      handle: 'mora',
      name: 'Mora',
      tags: ['fine-line'],
      rank: 4,
      status: 'shortlisted',
      history: [
        { at: '2026-09-05T12:00:00.000Z', rank: 1, status: 'shortlisted' },
        { at: '2026-10-10T12:00:00.000Z', rank: 4, status: 'shortlisted' },
      ],
    },
    {
      id: 'skip',
      handle: 'skip',
      name: 'Skip',
      tags: ['blackwork'],
      rank: 2,
      status: 'pass',
      history: [
        { at: '2026-09-05T12:00:00.000Z', rank: 2, status: 'researching' },
        { at: '2026-10-10T12:00:00.000Z', rank: 1, status: 'pass' },
      ],
    },
  ]

  it('computes Top N by month carrying forward unchanged artists and excluding pass', () => {
    const months = topNByMonth(sample, 5)
    expect(months.map((m) => m.month)).toEqual(['2026-09', '2026-10', '2026-11'])
    expect(months[0].artists.map((a) => `${a.id}:${a.rank}`)).toEqual(['mora:1', 'skip:2', 'vesper:4'])
    // Pass artist dropped in Oct; Mora still appears in Nov via carry-forward from Oct.
    expect(months[1].artists.map((a) => `${a.id}:${a.rank}`)).toEqual(['vesper:2', 'mora:4'])
    expect(months[2].artists.map((a) => `${a.id}:${a.rank}`)).toEqual(['vesper:1', 'mora:4'])
  })

  it('computes biggest risers and fallers across history', () => {
    const out = movers(sample)
    expect(out.risers[0]).toMatchObject({ id: 'vesper', fromRank: 4, toRank: 1, delta: 3 })
    expect(out.fallers[0]).toMatchObject({ id: 'mora', fromRank: 1, toRank: 4, delta: -3 })
  })

  it('weights monthly style share identically to preferredStyles', () => {
    const shares = styleShareByMonth(sample)
    const nov = shares.find((m) => m.month === '2026-11')
    // Nov active: vesper rank 1 -> weight 4.0 per tag (surrealism, realism); mora rank 4 -> weight 3.7 (fine-line).
    // Total = 11.7.
    expect(nov.totalWeight).toBeCloseTo(11.7, 3)
    expect(nov.styles.find((s) => s.tag === 'surrealism').weight).toBeCloseTo(4.0, 3)
    expect(nov.styles.find((s) => s.tag === 'fine-line').weight).toBeCloseTo(3.7, 3)
    expect(nov.styles.some((s) => s.tag === 'blackwork')).toBe(false)
  })

  it('sums days spent in each status up to nowIso', () => {
    const rows = statusDurations(sample, '2026-11-15T12:00:00.000Z')
    const contactNext = rows.find((r) => r.status === 'contact-next')
    expect(contactNext.totalDays).toBe(10)
    expect(contactNext.artists[0]).toMatchObject({ id: 'vesper', days: 10, isCurrent: true })

    const researching = rows.find((r) => r.status === 'researching')
    // Vesper 35d + Skip 35d = 70d
    expect(researching.totalDays).toBe(70)
    expect(researching.artistCount).toBe(2)
  })
})
