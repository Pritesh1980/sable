import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { createElement } from 'react'
import { useStorage } from '../hooks/useStorage'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { ideasCodec } from '../data/imageCodec'
import { normalizeReferenceImages, setImageNote } from '../data/planning'
import { getBoardCover } from '../data/boards'
import { clearBlobUrls } from '../data/blobUrls'
import { backend } from '../backend'

const KEY = 'user/u1/ideas/i1/photo.jpg'
const KEY2 = 'user/u1/ideas/i1/other.jpg'

function Gate({ children }) {
  const auth = useAuth()
  return auth?.user ? children : null
}
const wrapper = ({ children }) => createElement(AuthProvider, null, createElement(Gate, null, children))
const mount = () => renderHook(() => useStorage('tattoo_ideas', [], ideasCodec), { wrapper })

function seed(images) {
  const rows = [{ id: 'i1', title: 'Koi', images, updatedAt: '2026-10-01T00:00:00.000Z' }]
  localStorage.setItem('tattoo_local_session', JSON.stringify({ user: { id: 'u1', email: 'owner@example.com' } }))
  localStorage.setItem('tattoo_ideas', JSON.stringify(rows))
  localStorage.setItem('tattoo_remote_u1_ideas', JSON.stringify(rows))
}

beforeEach(() => {
  localStorage.clear()
  clearBlobUrls()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('idea state holds stored refs', () => {
  it('keeps a { key } ref as it is stored, online', async () => {
    seed([{ key: KEY, note: 'n' }])
    await backend.blobs.upload('u1', KEY, 'data:image/jpeg;base64,QUJD', 'image/jpeg')
    const { result } = mount()
    await waitFor(() => expect(result.current?.[0]?.[0]?.images).toEqual([{ key: KEY, note: 'n' }]))
  })

  it('keeps it offline, in state and in the cache', async () => {
    seed([{ key: KEY, note: 'n' }])
    vi.spyOn(backend.store, 'list').mockRejectedValue(new Error('offline'))
    vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
    const { result } = mount()
    await waitFor(() => expect(result.current?.[0]?.[0]?.images).toEqual([{ key: KEY, note: 'n' }]))
    act(() => result.current[1]((prev) => prev.map((i) => ({ ...i, title: 'Edited offline' }))))
    expect(JSON.parse(localStorage.getItem('tattoo_ideas'))[0].images).toEqual([{ key: KEY, note: 'n' }])
  })

  it('replaces a stored inline photo with its key, in state and remotely', async () => {
    seed([{ url: 'data:image/jpeg;base64,QUJD', note: 'n' }])
    const { result } = mount()
    await waitFor(() => expect(result.current?.[0]?.[0]?.images?.[0]?.key).toMatch(/^user\/u1\/ideas\/i1\//))
    expect(result.current[0][0].images[0]).toEqual({ key: result.current[0][0].images[0].key, note: 'n' })
    await waitFor(async () => {
      const rows = await backend.store.list('ideas')
      expect(rows[0]?.images?.[0]?.key).toBe(result.current[0][0].images[0].key)
      expect(rows[0]?.images?.[0]?.url).toBeUndefined()
    })
  })
})

describe('idea photo helpers work on stored refs', () => {
  it('normalizes to the stored shape', () => {
    expect(normalizeReferenceImages([
      'https://example.com/a.jpg',
      { key: KEY, note: 'n', url: 'blob:stale' },
      { url: '', note: 'empty' },
    ])).toEqual([
      { url: 'https://example.com/a.jpg', note: '' },
      { key: KEY, note: 'n' },
    ])
  })

  it('annotates one of two unavailable photos without touching the other', () => {
    const images = [{ key: KEY, note: '' }, { key: KEY2, note: '' }]
    expect(setImageNote(images, images[1], 'second')).toEqual([
      { key: KEY, note: '' },
      { key: KEY2, note: 'second' },
    ])
  })

  it('a board cover is the first idea photo as a stored ref', () => {
    const ideas = [{ id: 'i1', images: [{ key: KEY, note: '' }] }]
    expect(getBoardCover({ ideaIds: ['i1'] }, ideas)).toEqual({ key: KEY, note: '' })
    expect(getBoardCover({ cover: 'images/demo/a.jpg', ideaIds: ['i1'] }, ideas)).toBe('images/demo/a.jpg')
    expect(getBoardCover({ ideaIds: [] }, ideas)).toBe('')
  })
})
