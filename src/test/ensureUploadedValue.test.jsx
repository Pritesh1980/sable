import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createCollectionStore } from '../sync/collectionStore'
import { backend } from '../backend'

const USER = { id: 'u1', email: 'owner@example.com' }
const KEY = 'user/u1/ideas/i1/a.jpg'

function codecThatMoves() {
  return {
    toCanonical: (v) => v,
    toDisplay: async (v) => v,
    ensureUploaded: vi.fn(async (rows) => {
      const inline = rows.some((r) => r.image === 'data:x')
      if (!inline) return { value: rows, moved: 0 }
      return { value: rows.map((r) => (r.image === 'data:x' ? { ...r, image: KEY } : r)), moved: 1 }
    }),
  }
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('tattoo_local_session', JSON.stringify({ user: USER }))
})

describe('ensureUploaded hands back the value it changed', () => {
  it('publishes the replaced value and pushes it', async () => {
    localStorage.setItem('tattoo_ideas', JSON.stringify([{ id: 'i1', image: 'data:x', updatedAt: '2026-10-01T00:00:00.000Z' }]))
    const store = createCollectionStore({ key: 'tattoo_ideas', defaultValue: [], codec: codecThatMoves() })
    await store.start(USER)
    await vi.waitFor(async () => {
      const rows = await backend.store.list('ideas')
      expect(rows[0]?.image).toBe(KEY)
    })
    expect(store.getSnapshot()[0].image).toBe(KEY)
    expect(JSON.parse(localStorage.getItem('tattoo_ideas'))[0].image).toBe(KEY)
    store.stop()
  })

  it('does not publish a replaced value over an edit made meanwhile', async () => {
    localStorage.setItem('tattoo_ideas', JSON.stringify([{ id: 'i1', image: 'data:x', title: 'old', updatedAt: '2026-10-01T00:00:00.000Z' }]))
    let release
    const gate = new Promise((r) => { release = r })
    const codec = codecThatMoves()
    const upload = codec.ensureUploaded
    codec.ensureUploaded = vi.fn(async (rows, ctx) => { await gate; return upload(rows, ctx) })
    const store = createCollectionStore({ key: 'tattoo_ideas', defaultValue: [], codec })
    const started = store.start(USER)
    await vi.waitFor(() => expect(codec.ensureUploaded).toHaveBeenCalled())
    store.set((prev) => prev.map((r) => ({ ...r, title: 'edited' })))
    release()
    await started
    await vi.waitFor(() => expect(store.getSnapshot()[0].image).toBe(KEY))
    expect(store.getSnapshot()[0].title).toBe('edited')
    store.stop()
  })
})
