import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEMO_ARTISTS,
  DEMO_IDEAS,
  DEMO_SESSION,
  seedDemoData,
  maybeSeedDemo,
} from '../data/demoSeed'
import { DEFAULT_ARTISTS, STYLE_TAGS } from '../data/artists'

describe('DEMO_ARTISTS data integrity', () => {
  it('has 6-8 fictional artists', () => {
    expect(DEMO_ARTISTS.length).toBeGreaterThanOrEqual(6)
    expect(DEMO_ARTISTS.length).toBeLessThanOrEqual(8)
  })

  it('does not reuse any real artist id or handle', () => {
    const real = new Set(
      DEFAULT_ARTISTS.flatMap((a) => [a.id.toLowerCase(), a.handle.toLowerCase()])
    )
    for (const a of DEMO_ARTISTS) {
      expect(real.has(a.id.toLowerCase())).toBe(false)
      expect(real.has(a.handle.toLowerCase())).toBe(false)
    }
  })

  it('uses only canonical style tags', () => {
    for (const a of DEMO_ARTISTS) {
      expect(a.tags.length).toBeGreaterThan(0)
      for (const tag of a.tags) expect(STYLE_TAGS).toContain(tag)
    }
  })

  it('has contiguous ranks 1..N and unique ids', () => {
    const ranks = DEMO_ARTISTS.map((a) => a.rank).sort((x, y) => x - y)
    expect(ranks).toEqual(DEMO_ARTISTS.map((_, i) => i + 1))
    expect(new Set(DEMO_ARTISTS.map((a) => a.id)).size).toBe(DEMO_ARTISTS.length)
  })

  it('matches the stored artist record shape', () => {
    for (const a of DEMO_ARTISTS) {
      expect(a).toMatchObject({
        id: expect.any(String),
        handle: expect.any(String),
        name: expect.any(String),
        tags: expect.any(Array),
        images: expect.any(Array),
        rank: expect.any(Number),
        status: expect.any(String),
        notes: expect.any(String),
      })
      expect(a).toHaveProperty('studio')
    }
  })

  it('references committed demo images that exist on disk', () => {
    for (const a of DEMO_ARTISTS) {
      expect(a.images.length).toBeGreaterThan(0)
      for (const img of a.images) {
        expect(img).toMatch(/^\/images\/demo\//)
        expect(existsSync(join(process.cwd(), 'public', img))).toBe(true)
      }
    }
  })
})

describe('DEMO_IDEAS', () => {
  it('link only to demo artists and use canonical tags', () => {
    const ids = new Set(DEMO_ARTISTS.map((a) => a.id))
    for (const idea of DEMO_IDEAS) {
      for (const linked of idea.linkedArtists) expect(ids.has(linked)).toBe(true)
      for (const tag of idea.tags) expect(STYLE_TAGS).toContain(tag)
      expect(['idea', 'booked', 'done']).toContain(idea.status)
    }
  })
})

describe('seedDemoData', () => {
  beforeEach(() => localStorage.clear())

  it('writes the demo session, artist metadata and ideas', () => {
    seedDemoData()
    expect(JSON.parse(localStorage.getItem('tattoo_local_session'))).toEqual(DEMO_SESSION)
    const meta = JSON.parse(localStorage.getItem('tattoo_artists_meta'))
    expect(meta.map((a) => a.id)).toEqual(DEMO_ARTISTS.map((a) => a.id))
    expect(JSON.parse(localStorage.getItem('tattoo_ideas')).length).toBe(DEMO_IDEAS.length)
  })

  it('mirrors artists and ideas into the local remote-store namespace with updatedAt', () => {
    seedDemoData()
    const remote = JSON.parse(localStorage.getItem('tattoo_remote_artistsMeta'))
    expect(remote.length).toBe(DEMO_ARTISTS.length)
    for (const row of remote) expect(row.updatedAt).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('tattoo_remote_ideas')).length).toBe(DEMO_IDEAS.length)
  })

  it('marks the image migration as done so no migration runs on demo data', () => {
    seedDemoData()
    expect(localStorage.getItem('tattoo_img_migrated_v1')).toBe('1')
  })
})

describe('maybeSeedDemo', () => {
  beforeEach(() => localStorage.clear())

  it('seeds when ?demo=1 and no session exists', () => {
    expect(maybeSeedDemo({ search: '?demo=1' }, 'local')).toBe(true)
    expect(localStorage.getItem('tattoo_artists_meta')).toBeTruthy()
  })

  it('does nothing without the demo flag', () => {
    expect(maybeSeedDemo({ search: '' }, 'local')).toBe(false)
    expect(localStorage.getItem('tattoo_artists_meta')).toBeNull()
  })

  it('never seeds over an existing signed-in session', () => {
    localStorage.setItem(
      'tattoo_local_session',
      JSON.stringify({ user: { id: 'local-me@x.com', email: 'me@x.com' } })
    )
    expect(maybeSeedDemo({ search: '?demo=1' }, 'local')).toBe(false)
    expect(localStorage.getItem('tattoo_artists_meta')).toBeNull()
  })

  it('is idempotent: a second visit with ?demo=1 keeps demo-session edits', () => {
    maybeSeedDemo({ search: '?demo=1' }, 'local')
    const edited = JSON.parse(localStorage.getItem('tattoo_artists_meta'))
    edited[0] = { ...edited[0], notes: 'edited in demo' }
    localStorage.setItem('tattoo_artists_meta', JSON.stringify(edited))
    expect(maybeSeedDemo({ search: '?demo=1' }, 'local')).toBe(false)
    expect(JSON.parse(localStorage.getItem('tattoo_artists_meta'))[0].notes).toBe('edited in demo')
  })

  it('only runs against the local backend', () => {
    expect(maybeSeedDemo({ search: '?demo=1' }, 'supabase')).toBe(false)
    expect(localStorage.getItem('tattoo_artists_meta')).toBeNull()
  })
})
