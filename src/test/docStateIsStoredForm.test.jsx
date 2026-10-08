import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { createElement } from 'react'
import { useStorage } from '../hooks/useStorage'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { ideasCodec, conceptsCodec } from '../data/imageCodec'
import { clearBlobUrls } from '../data/blobUrls'
import { backend } from '../backend'

function Gate({ children }) {
  const auth = useAuth()
  return auth?.user ? children : null
}
const wrapper = ({ children }) => createElement(AuthProvider, null, createElement(Gate, null, children))

const IDEAS = [{ id: 'i1', title: 'Koi', images: [{ key: 'user/u1/ideas/i1/a.jpg', note: 'n' }, { url: 'https://example.com/b.jpg', note: '' }], updatedAt: '2026-10-01T00:00:00.000Z' }]
const CONCEPTS = [{ id: 'c1', prompt: 'Moth', imageUrl: 'user/u1/concepts/c1/a.jpg', variants: [{ id: 'v1', imageUrl: 'user/u1/concepts/c1/v.jpg' }], updatedAt: '2026-10-01T00:00:00.000Z' }]

const cases = [
  ['ideas', 'tattoo_ideas', ideasCodec, IDEAS],
  ['concepts', 'tattoo_concepts', conceptsCodec, CONCEPTS],
]

beforeEach(() => {
  localStorage.clear()
  clearBlobUrls()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  localStorage.setItem('tattoo_local_session', JSON.stringify({ user: { id: 'u1', email: 'owner@example.com' } }))
})
afterEach(() => vi.restoreAllMocks())

describe.each(cases)('%s state is its own stored form', (collection, key, codec, rows) => {
  const seed = () => {
    localStorage.setItem(key, JSON.stringify(rows))
    localStorage.setItem(`tattoo_remote_u1_${collection}`, JSON.stringify(rows))
  }
  const mount = () => renderHook(() => useStorage(key, [], codec), { wrapper })
  const expectStored = (value) => expect(codec.toCanonical(value)).toEqual(value)

  it('after hydrate and the first pull, online', async () => {
    seed()
    const { result } = mount()
    await waitFor(() => expect(result.current?.[0]).toEqual(rows))
    expectStored(result.current[0])
  })

  it('after hydrate, offline', async () => {
    seed()
    vi.spyOn(backend.store, 'list').mockRejectedValue(new Error('offline'))
    vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
    const { result } = mount()
    await waitFor(() => expect(result.current?.[0]).toEqual(rows))
    expectStored(result.current[0])
  })

  it('after an edit, and the cache matches state', async () => {
    seed()
    const { result } = mount()
    await waitFor(() => expect(result.current?.[0]).toEqual(rows))
    act(() => result.current[1]((prev) => prev.map((r) => ({ ...r, tags: ['blackwork'] }))))
    expectStored(result.current[0])
    // Sync bookkeeping aside, the cache is the state.
    const bare = (row) => {
      const rest = { ...row }
      delete rest.editGen
      delete rest.updatedAt
      return rest
    }
    expect(JSON.parse(localStorage.getItem(key)).map(bare)).toEqual(result.current[0].map(bare))
  })
})
