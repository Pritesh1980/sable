import { describe, it, expect } from 'vitest'
import { DEFAULT_ARTISTS, DEFAULT_STUDIOS, STYLE_TAGS, createArtist, parseInstagramHandle } from '../data/artists'

describe('DEFAULT_ARTISTS data integrity', () => {
  it('has no tier field on any artist', () => {
    const withTier = DEFAULT_ARTISTS.filter((a) => 'tier' in a)
    expect(withTier).toHaveLength(0)
  })

  it('has unique IDs', () => {
    const ids = DEFAULT_ARTISTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has unique ranks', () => {
    const ranks = DEFAULT_ARTISTS.map((a) => a.rank)
    expect(new Set(ranks).size).toBe(ranks.length)
  })

  it('has sequential ranks starting from 1', () => {
    const ranks = DEFAULT_ARTISTS.map((a) => a.rank).sort((a, b) => a - b)
    ranks.forEach((r, i) => expect(r).toBe(i + 1))
  })

  it('has 30 artists', () => {
    expect(DEFAULT_ARTISTS).toHaveLength(30)
  })

  it('every assigned studio ID exists in DEFAULT_STUDIOS', () => {
    const studioIds = new Set(DEFAULT_STUDIOS.map((s) => s.id))
    const invalid = DEFAULT_ARTISTS.filter((a) => a.studio !== null && !studioIds.has(a.studio))
    expect(invalid).toHaveLength(0)
  })

  it('every artist has required fields', () => {
    for (const a of DEFAULT_ARTISTS) {
      expect(a).toHaveProperty('id')
      expect(a).toHaveProperty('handle')
      expect(a).toHaveProperty('tags')
      expect(a).toHaveProperty('rank')
      expect(a).toHaveProperty('studio')
    }
  })

  it('every artist has a non-empty styleNote and styleDescriptor', () => {
    for (const a of DEFAULT_ARTISTS) {
      expect(typeof a.styleNote).toBe('string')
      expect(a.styleNote.trim().length).toBeGreaterThan(0)
      expect(typeof a.styleDescriptor).toBe('string')
      expect(a.styleDescriptor.trim().length).toBeGreaterThan(0)
    }
  })

  it('every artist tag is a known STYLE_TAG', () => {
    const valid = new Set(STYLE_TAGS)
    for (const a of DEFAULT_ARTISTS) {
      for (const tag of a.tags) expect(valid.has(tag)).toBe(true)
    }
  })
})

describe('DEFAULT_STUDIOS data integrity', () => {
  it('has unique IDs', () => {
    const ids = DEFAULT_STUDIOS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('createArtist', () => {
  const existing = [
    { id: 'zoia.ink', handle: 'zoia.ink', name: '', rank: 1 },
    { id: 'oscarakermo', handle: 'oscarakermo', name: 'Oscar Akermo', rank: 4 },
  ]

  it('creates an artist with defaults and rank after the current max', () => {
    const artist = createArtist({ handle: 'new_artist', name: 'New Artist' }, existing)
    expect(artist).toEqual({
      id: 'new_artist',
      handle: 'new_artist',
      name: 'New Artist',
      tags: [],
      images: [],
      rank: 5,
      status: 'researching',
      notes: '',
      studio: null,
    })
  })

  it('starts at rank 1 when the list is empty', () => {
    expect(createArtist({ handle: 'first', name: '' }, []).rank).toBe(1)
  })

  it('returns null for a duplicate handle, case-insensitively', () => {
    expect(createArtist({ handle: 'zoia.ink', name: '' }, existing)).toBeNull()
    expect(createArtist({ handle: 'OscarAkermo', name: '' }, existing)).toBeNull()
  })
})

describe('parseInstagramHandle', () => {
  it('strips @ and whitespace', () => {
    expect(parseInstagramHandle(' @zoia.ink ')).toBe('zoia.ink')
  })

  it('extracts the handle from a full Instagram URL', () => {
    expect(parseInstagramHandle('https://www.instagram.com/zoia.ink/?hl=en')).toBe('zoia.ink')
    expect(parseInstagramHandle('http://instagram.com/oscarakermo')).toBe('oscarakermo')
    expect(parseInstagramHandle('instagram.com/johndarktattoo_/')).toBe('johndarktattoo_')
  })

  it('passes a bare handle through', () => {
    expect(parseInstagramHandle('tattoo__amir')).toBe('tattoo__amir')
  })

  it('returns empty string for empty or junk input', () => {
    expect(parseInstagramHandle('')).toBe('')
    expect(parseInstagramHandle('   ')).toBe('')
    expect(parseInstagramHandle('https://www.instagram.com/')).toBe('')
  })
})

describe('createArtist with tags and status', () => {
  it('accepts optional tags and status', () => {
    const artist = createArtist(
      { handle: 'new_one', name: '', tags: ['blackwork', 'dark-fantasy'], status: 'shortlisted' },
      []
    )
    expect(artist.tags).toEqual(['blackwork', 'dark-fantasy'])
    expect(artist.status).toBe('shortlisted')
  })

  it('still defaults tags/status when omitted', () => {
    const artist = createArtist({ handle: 'plain', name: '' }, [])
    expect(artist.tags).toEqual([])
    expect(artist.status).toBe('researching')
  })
})
