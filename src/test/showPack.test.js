import { describe, it, expect, afterEach } from 'vitest'
import { clearBlobUrls, registerBlobUrl } from '../data/blobUrls'
import {
  defaultPackSelection,
  formatBytes,
  formatPackTime,
  lineupDetail,
  linkedIdeas,
  packArtistChoices,
  packFreshness,
  packStatus,
  photoPlaces,
  planShowPack,
} from '../data/showPack'

// #209: an offline show pack. These are the pure parts: who and what goes in
// a pack, what it holds, and what its stored state honestly says.

const KEY_A = 'user/u1/artists/mora/a.jpg'
const KEY_B = 'user/u1/ideas/fern/b.jpg'

const artists = [
  { id: 'mora', handle: 'mora.blackfern', name: 'Mora Vane', rank: 5, tags: ['fine-line'], styleNote: 'Botanical fine-line', notes: 'Ask about forearm', studio: 'no-regrets-london',
    images: [{ key: KEY_A }, 'images/demo/mora/1.webp', { url: 'https://cdn.example.com/x.jpg', addedAt: '2026-01-01' }] },
  { id: 'vesper', handle: 'vesper_noctis', name: 'Vesper Ash', rank: 1, tags: ['surrealism'], styleNote: '', notes: '', images: ['images/demo/vesper/1.webp'] },
  { id: 'hexen', handle: 'hexen_atlas', name: '', rank: 3, tags: [], images: [] },
  { id: 'ferrum', handle: 'ferrum_line', name: '', rank: 6, tags: [], images: [] },
]

const ideas = [
  { id: 'fern', title: 'Botanical forearm', description: 'Fern along the arm', placement: 'forearm', status: 'idea', tags: ['fine-line'],
    linkedArtists: ['mora'], images: [{ key: KEY_B, note: 'frond spacing' }, { url: 'images/demo/mora/1.webp', note: 'shading' }] },
  { id: 'glass', title: 'Hourglass', description: '', placement: '', status: 'booked', tags: [], linkedArtists: ['vesper', 'hexen'], images: [] },
  { id: 'old', title: 'Done piece', status: 'done', linkedArtists: ['mora'], images: [] },
  { id: 'loose', title: 'Unlinked', status: 'idea', linkedArtists: [], images: [] },
]

const entries = [
  { name: 'Mora Vane', handle: 'mora.blackfern', note: 'No Regrets Studios, Booth 315A' },
  { name: '', handle: 'hexen_atlas', note: '' },
  { name: 'Stranger', handle: 'stranger', note: 'Booth 2' },
]

const edition = { editionKey: 'uk-tattoo-fest@2027', label: 'UK Tattoo Fest 2027', name: 'UK Tattoo Fest', dates: '13–14 March 2027', location: 'Marshall Arena, Milton Keynes' }
const studios = [{ id: 'no-regrets-london', name: 'No Regrets London' }]

describe('packArtistChoices', () => {
  it('offers saved artists who are attending or on the line-up, attending first then by rank', () => {
    const choices = packArtistChoices(artists, { attendingIds: ['vesper', 'mora'], entries })
    expect(choices.map((c) => [c.id, c.attending, c.onLineup])).toEqual([
      ['vesper', true, false],
      ['mora', true, true],
      ['hexen', false, true],
    ])
    expect(choices[2].label).toBe('@hexen_atlas')
  })

  it('keeps an artist the pack already holds, even once they are unmarked', () => {
    const choices = packArtistChoices(artists, { attendingIds: [], entries: [], selectedIds: ['ferrum'] })
    expect(choices.map((c) => c.id)).toEqual(['ferrum'])
  })
})

describe('linkedIdeas', () => {
  it('lists open ideas linked to any chosen artist, never done or unlinked ones', () => {
    expect(linkedIdeas(ideas, ['mora']).map((i) => i.id)).toEqual(['fern'])
    expect(linkedIdeas(ideas, ['hexen', 'mora']).map((i) => i.id)).toEqual(['fern', 'glass'])
    expect(linkedIdeas(ideas, [])).toEqual([])
  })
})

describe('defaultPackSelection', () => {
  it('starts from who is marked attending and the ideas linked to them', () => {
    expect(defaultPackSelection({ artists, ideas, attendingIds: ['mora', 'gone'], entries })).toEqual({
      artistIds: ['mora'],
      ideaIds: ['fern'],
    })
  })
})

describe('planShowPack', () => {
  const plan = planShowPack({ edition, artists, ideas, entries, studios, selection: { artistIds: ['mora', 'vesper'], ideaIds: ['fern', 'loose', 'missing'] } })

  it('records the show it belongs to', () => {
    expect(plan.editionKey).toBe('uk-tattoo-fest@2027')
    expect(plan.edition).toEqual({ label: 'UK Tattoo Fest 2027', dates: '13–14 March 2027', location: 'Marshall Arena, Milton Keynes' })
  })

  it('carries the artist details and the booth note recorded in the line-up, never a guessed booth', () => {
    const [mora, vesper] = plan.artists
    expect(mora).toMatchObject({
      id: 'mora', label: 'Mora Vane', handle: 'mora.blackfern', tags: ['fine-line'], styleNote: 'Botanical fine-line',
      notes: 'Ask about forearm', studio: 'No Regrets London', booth: '315A', lineupNote: 'No Regrets Studios, Booth 315A',
    })
    expect(vesper).toMatchObject({ id: 'vesper', booth: '', lineupNote: '' })
  })

  it('keeps the selected ideas that still exist, with their text and photo notes', () => {
    expect(plan.ideas.map((i) => i.id)).toEqual(['fern', 'loose'])
    expect(plan.ideas[0]).toMatchObject({ title: 'Botanical forearm', description: 'Fern along the arm', placement: 'forearm', status: 'idea', artistIds: ['mora'] })
    expect(plan.ideas[0].photos).toEqual([
      { id: `key:${KEY_B}`, note: 'frond spacing' },
      { id: 'path:/images/demo/mora/1.webp', note: 'shading' },
    ])
    expect(plan.selection).toEqual({ artistIds: ['mora', 'vesper'], ideaIds: ['fern', 'loose'] })
  })

  it('lists each photo once, as its stored ref, and marks another site’s photos as external', () => {
    expect(plan.photos).toEqual([
      { id: `key:${KEY_A}`, ref: { key: KEY_A }, external: false },
      { id: 'path:/images/demo/mora/1.webp', ref: 'images/demo/mora/1.webp', external: false },
      { id: 'url:https://cdn.example.com/x.jpg', ref: 'https://cdn.example.com/x.jpg', external: true },
      { id: 'path:/images/demo/vesper/1.webp', ref: 'images/demo/vesper/1.webp', external: false },
      { id: `key:${KEY_B}`, ref: { key: KEY_B }, external: false },
    ])
    expect(plan.artists[0].photos).toEqual([`key:${KEY_A}`, 'path:/images/demo/mora/1.webp', 'url:https://cdn.example.com/x.jpg'])
  })

  // Review finding (codex): a display url resolved from a key this session
  // goes back to its key, so an expiring url is never what the pack keeps.
  it('turns a known display url back into its key', () => {
    registerBlobUrl(KEY_B, 'https://storage.example.com/signed/b.jpg?token=secret')
    const legacy = ideas.map((i) => (i.id === 'fern' ? { ...i, images: [{ url: 'https://storage.example.com/signed/b.jpg?token=secret', note: 'n' }] } : i))
    const packed = planShowPack({ edition, artists, ideas: legacy, entries, studios, selection: { artistIds: [], ideaIds: ['fern'] } })
    expect(packed.photos).toEqual([{ id: `key:${KEY_B}`, ref: { key: KEY_B }, external: false }])
    expect(JSON.stringify(packed)).not.toContain('token=secret')
  })

  it('never stores a resolved display url', () => {
    expect(JSON.stringify(plan)).not.toMatch(/blob:|data:/)
  })
})

afterEach(() => clearBlobUrls())

describe('packFreshness', () => {
  const selection = { artistIds: ['mora'], ideaIds: ['fern'] }
  const plan = planShowPack({ edition, artists, ideas, entries, studios, selection })
  const pack = { ...plan, state: 'done' }

  it('is fresh while the library matches what was packed', () => {
    expect(packFreshness(pack, planShowPack({ edition, artists, ideas, entries, studios, selection })).stale).toBe(false)
  })

  it('is stale once a packed artist gains a photo, an idea is edited, or the choice changes', () => {
    const morePhotos = artists.map((a) => (a.id === 'mora' ? { ...a, images: [...a.images, 'images/demo/mora/2.webp'] } : a))
    const edited = ideas.map((i) => (i.id === 'fern' ? { ...i, description: 'Fern and moth' } : i))
    expect(packFreshness(pack, planShowPack({ edition, artists: morePhotos, ideas, entries, studios, selection })).stale).toBe(true)
    expect(packFreshness(pack, planShowPack({ edition, artists, ideas: edited, entries, studios, selection })).stale).toBe(true)
    expect(packFreshness(pack, planShowPack({ edition, artists, ideas, entries, studios, selection: { ...selection, artistIds: ['mora', 'vesper'] } })).stale).toBe(true)
  })
})

describe('packStatus', () => {
  const photos = [
    { id: 'a', ref: 'images/a.webp', external: false },
    { id: 'b', ref: 'images/b.webp', external: false },
    { id: 'x', ref: 'https://cdn.example.com/x.jpg', external: true },
  ]
  const verified = (present, extra = {}) => ({ checkedAt: '2026-11-26T14:02:00.000Z', present, missing: [], damaged: [], bytes: 2048, ...extra })
  const done = (over = {}) => ({ photos, state: 'done', results: { a: 'saved', b: 'saved', x: 'external' }, verification: verified(['a', 'b']), ...over })

  it('has nothing to say without a pack', () => {
    expect(packStatus(null).state).toBe('none')
  })

  it('is ready only when every photo that can be saved was read back intact', () => {
    expect(packStatus(done())).toMatchObject({ state: 'ready', saved: 2, savable: 2, external: 1, total: 3, bytes: 2048, checkedAt: '2026-11-26T14:02:00.000Z' })
  })

  it('is preparing while a run is going, whatever the record says', () => {
    expect(packStatus(done(), { running: true }).state).toBe('preparing')
  })

  it('reads a run that never finished (a reload, a stop) as interrupted, not ready', () => {
    expect(packStatus(done({ state: 'preparing', verification: verified(['a', 'b']) })).state).toBe('interrupted')
  })

  it('is incomplete after a partial run, naming why', () => {
    const offline = packStatus(done({ results: { a: 'saved', b: 'offline', x: 'external' }, verification: verified(['a']) }))
    expect(offline).toMatchObject({ state: 'incomplete', reason: 'offline', saved: 1 })
    expect(offline.problems).toEqual([{ id: 'b', why: 'offline' }])

    const quota = packStatus(done({ stoppedBy: 'quota', results: { a: 'quota', b: 'skipped', x: 'external' }, verification: verified([]) }))
    expect(quota).toMatchObject({ state: 'incomplete', reason: 'quota', saved: 0 })
  })

  it('is incomplete when bytes that were saved have since gone or changed', () => {
    const lost = packStatus(done({ verification: verified(['a'], { missing: ['b'] }) }))
    expect(lost).toMatchObject({ state: 'incomplete', reason: 'lost' })
    expect(lost.problems).toEqual([{ id: 'b', why: 'missing' }])
    const damaged = packStatus(done({ verification: verified(['a'], { damaged: ['b'] }) }))
    expect(damaged.problems).toEqual([{ id: 'b', why: 'damaged' }])
  })

  it('is never ready without a verification on record', () => {
    expect(packStatus(done({ verification: null })).state).toBe('incomplete')
  })
})

describe('photoPlaces', () => {
  it('says where each photo appears, for naming the ones that could not be saved', () => {
    const plan = planShowPack({ edition, artists, ideas, entries, studios, selection: { artistIds: ['mora'], ideaIds: ['fern'] } })
    const places = photoPlaces(plan)
    expect(places.get('path:/images/demo/mora/1.webp')).toEqual(['Mora Vane, photo 2', 'Botanical forearm, photo 2'])
    expect(places.get(`key:${KEY_B}`)).toEqual(['Botanical forearm, photo 1'])
  })
})

describe('formatting', () => {
  it('gives the last-checked time as a day and a clock time', () => {
    expect(formatPackTime('2026-11-26T12:02:00.000Z')).toMatch(/^26 Nov, \d{2}:\d{2}$/)
    expect(formatPackTime('2026-11-26T12:02:00.000Z', { time: false })).toBe('26 Nov')
    expect(formatPackTime('')).toBe('')
    expect(formatPackTime('not a date')).toBe('')
  })

  it('gives sizes in KB or MB', () => {
    expect(formatBytes(10)).toBe('1 KB')
    expect(formatBytes(300 * 1024)).toBe('300 KB')
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB')
  })
})

describe('lineupDetail', () => {
  it('keeps what the line-up says besides the booth', () => {
    expect(lineupDetail('No Regrets Studios, Booth 315A')).toBe('No Regrets Studios')
    expect(lineupDetail('Booth 12')).toBe('')
    expect(lineupDetail('Slovakia')).toBe('Slovakia')
    expect(lineupDetail('')).toBe('')
  })
})
