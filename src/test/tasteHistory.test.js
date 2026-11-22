import { describe, it, expect } from 'vitest'
import {
  MAX_HISTORY_ENTRIES,
  appendArtistHistory,
  mergeArtistHistories,
  movers,
  recordArtistHistoryOnEdit,
  styleShareByMonth,
  topNByMonth,
} from '../data/tasteHistory'

describe('appendArtistHistory & recordArtistHistoryOnEdit (#188)', () => {
  it('enforces one entry per day and caps history at 200 entries', () => {
    let history = []
    history = appendArtistHistory(history, { at: '2026-09-01T09:00:00.000Z', rank: 8 })
    history = appendArtistHistory(history, { at: '2026-09-01T15:30:00.000Z', rank: 4 })
    expect(history).toEqual([{ at: '2026-09-01T15:30:00.000Z', rank: 4 }])

    history = appendArtistHistory(history, { at: '2026-09-02T10:00:00.000Z', rank: 2 })
    expect(history).toHaveLength(2)

    let capped = []
    const baseMs = Date.parse('2026-01-01T12:00:00.000Z')
    for (let d = 0; d < 220; d += 1) {
      const iso = new Date(baseMs + d * 86_400_000).toISOString()
      capped = appendArtistHistory(capped, { at: iso, rank: (d % 10) + 1 })
    }
    expect(capped).toHaveLength(MAX_HISTORY_ENTRIES)
    expect(capped[0].at).toBe(new Date(baseMs + 20 * 86_400_000).toISOString())
  })

  it('handles a whole-list rerank on the same day with at most one entry per artist', () => {
    const initial = [
      { id: 'a', rank: 1, history: [{ at: '2026-10-01T10:00:00.000Z', rank: 1 }] },
      { id: 'b', rank: 2, history: [{ at: '2026-10-01T10:00:00.000Z', rank: 2 }] },
      { id: 'c', rank: 3, history: [{ at: '2026-10-01T10:00:00.000Z', rank: 3 }] },
    ]
    const midDayOrder = [
      { ...initial[2], rank: 1 },
      { ...initial[0], rank: 2 },
      { ...initial[1], rank: 3 },
    ].map((next) => {
      const prev = initial.find((p) => p.id === next.id)
      return recordArtistHistoryOnEdit(prev, next, '2026-10-15T11:00:00.000Z')
    })

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

describe('topNByMonth, movers & styleShareByMonth (#188)', () => {
  const sample = [
    {
      id: 'vesper',
      handle: 'vesper',
      name: 'Vesper',
      tags: ['surrealism', 'realism'],
      rank: 1,
      history: [
        { at: '2026-09-05T12:00:00.000Z', rank: 4 },
        { at: '2026-10-10T12:00:00.000Z', rank: 2 },
        { at: '2026-11-05T12:00:00.000Z', rank: 1 },
      ],
    },
    {
      id: 'mora',
      handle: 'mora',
      name: 'Mora',
      tags: ['fine-line'],
      rank: 4,
      history: [
        { at: '2026-09-05T12:00:00.000Z', rank: 1 },
        { at: '2026-10-10T12:00:00.000Z', rank: 4 },
      ],
    },
    {
      id: 'ferrum',
      handle: 'ferrum',
      name: 'Ferrum',
      tags: ['blackwork'],
      rank: 5,
      history: [
        { at: '2026-09-05T12:00:00.000Z', rank: 2 },
        { at: '2026-10-10T12:00:00.000Z', rank: 5 },
      ],
    },
  ]

  it('computes Top N by month carrying forward unchanged artists', () => {
    const months = topNByMonth(sample, 5)
    expect(months.map((m) => m.month)).toEqual(['2026-09', '2026-10', '2026-11'])
    expect(months[0].artists.map((a) => `${a.id}:${a.rank}`)).toEqual(['mora:1', 'ferrum:2', 'vesper:4'])
    expect(months[1].artists.map((a) => `${a.id}:${a.rank}`)).toEqual(['vesper:2', 'mora:4', 'ferrum:5'])
    expect(months[2].artists.map((a) => `${a.id}:${a.rank}`)).toEqual(['vesper:1', 'mora:4', 'ferrum:5'])
  })

  it('computes biggest risers and fallers across history', () => {
    const out = movers(sample)
    expect(out.risers[0]).toMatchObject({ id: 'vesper', fromRank: 4, toRank: 1, delta: 3 })
    expect(out.fallers[0]).toMatchObject({ id: 'mora', fromRank: 1, toRank: 4, delta: -3 })
  })

  it('weights monthly style share identically to preferredStyles', () => {
    const shares = styleShareByMonth(sample)
    const nov = shares.find((m) => m.month === '2026-11')
    // Nov: vesper rank 1 -> 4.0 per tag (surrealism, realism); mora rank 4 -> 3.7 (fine-line); ferrum rank 5 -> 3.6 (blackwork).
    // Total = 15.3.
    expect(nov.totalWeight).toBeCloseTo(15.3, 3)
    expect(nov.styles.find((s) => s.tag === 'surrealism').weight).toBeCloseTo(4.0, 3)
    expect(nov.styles.find((s) => s.tag === 'fine-line').weight).toBeCloseTo(3.7, 3)
    expect(nov.styles.find((s) => s.tag === 'blackwork').weight).toBeCloseTo(3.6, 3)
  })

  it('includes untouched artists in monthly Top 5 and style share even with recent updatedAt (H1, M1)', () => {
    const library = [
      {
        id: 'top1',
        handle: 'top1',
        name: 'Top One',
        tags: ['realism'],
        rank: 1,
        updatedAt: '2026-11-20T10:00:00.000Z',
      },
      {
        id: 'top2',
        handle: 'top2',
        name: 'Top Two',
        tags: ['blackwork'],
        rank: 2,
        updatedAt: '2026-11-20T10:00:00.000Z',
      },
      {
        id: 'moved',
        handle: 'moved',
        name: 'Moved',
        tags: ['fine-line'],
        rank: 3,
        history: [
          { at: '2026-09-05T12:00:00.000Z', rank: 5 },
          { at: '2026-11-05T12:00:00.000Z', rank: 3 },
        ],
      },
    ]

    const months = topNByMonth(library, 5)
    expect(months.map((m) => m.month)).toEqual(['2026-09', '2026-10', '2026-11'])
    expect(months[0].artists.map((a) => `${a.id}:${a.rank}`)).toEqual(['top1:1', 'top2:2', 'moved:5'])
    expect(months[2].artists.map((a) => `${a.id}:${a.rank}`)).toEqual(['top1:1', 'top2:2', 'moved:3'])

    const styles = styleShareByMonth(library)
    expect(styles[0].styles.map((s) => s.tag)).toContain('realism')
    expect(styles[0].styles.map((s) => s.tag)).toContain('blackwork')
  })

  it('seeds starting rank on first edit so movers sees the full climb (H2)', () => {
    const untouched = {
      id: 'climb',
      handle: 'climb',
      name: 'Climb',
      rank: 8,
      updatedAt: '2026-10-01T12:00:00.000Z',
    }
    const edited = recordArtistHistoryOnEdit(
      untouched,
      { ...untouched, rank: 1 },
      '2026-11-10T12:00:00.000Z',
    )
    expect(edited.history).toHaveLength(2)
    const out = movers([edited])
    expect(out.risers[0]).toMatchObject({ id: 'climb', fromRank: 8, toRank: 1, delta: 7 })
  })

  it('fills intermediate gap months and extends through nowIso (L2, L3)', () => {
    const gapped = [
      {
        id: 'a',
        handle: 'a',
        tags: ['realism'],
        rank: 1,
        history: [
          { at: '2026-01-31T12:00:00.000Z', rank: 2 },
          { at: '2026-03-01T12:00:00.000Z', rank: 1 },
        ],
      },
    ]
    const months = topNByMonth(gapped, 5)
    expect(months.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(months[1].artists[0]).toMatchObject({ id: 'a', rank: 2 })

    const extended = topNByMonth(gapped, 5, '2026-04-10T12:00:00.000Z')
    expect(extended.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04'])
    expect(extended[3].artists[0]).toMatchObject({ id: 'a', rank: 1 })
  })

  it('safely ignores non-array malformed history fields (M2)', () => {
    const dirty = [
      { id: 'badNull', handle: 'n', rank: 1, history: null },
      { id: 'badObj', handle: 'o', rank: 2, history: { broken: true } },
      {
        id: 'ok',
        handle: 'ok',
        rank: 3,
        history: [
          { at: '2026-10-01T12:00:00.000Z', rank: 4 },
          { at: '2026-11-01T12:00:00.000Z', rank: 3 },
        ],
      },
    ]
    expect(() => topNByMonth(dirty, 5)).not.toThrow()
    expect(() => movers(dirty)).not.toThrow()
    expect(() => styleShareByMonth(dirty)).not.toThrow()
    expect(mergeArtistHistories(null, { bad: 1 })).toEqual([])
  })
})
