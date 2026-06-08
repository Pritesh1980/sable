import { describe, it, expect, beforeEach } from 'vitest'
import { createBackend } from '../backend'

// An in-memory mock backend. Running the same contract against both this and the
// real local adapter proves the interfaces are substitutable — the property the
// whole adapter boundary exists to guarantee.
function createMockBackend() {
  const tables = {}
  const blobs = {}
  const listeners = new Set()
  let session = null
  const table = (c) => (tables[c] = tables[c] || new Map())
  return {
    kind: 'mock',
    auth: {
      async getSession() { return session },
      async signIn({ email }) {
        session = { user: { id: `mock-${email}`, email } }
        listeners.forEach((cb) => cb(session))
        return session
      },
      async signOut() { session = null; listeners.forEach((cb) => cb(null)) },
      onAuthStateChange(cb) { listeners.add(cb); return () => listeners.delete(cb) },
    },
    store: {
      async list(c) { return [...table(c).values()] },
      async upsert(c, rows = []) { rows.forEach((r) => table(c).set(r.id, r)); return [...table(c).values()] },
      async remove(c, ids = []) { ids.forEach((id) => table(c).delete(id)) },
      async pull(c, since) {
        const rows = [...table(c).values()]
        return since ? rows.filter((r) => String(r.updatedAt || '') > String(since)) : rows
      },
    },
    blobs: {
      async upload(_u, key, blob) { blobs[key] = blob; return { key } },
      async getUrl(key) { return blobs[key] || '' },
      async remove(key) { delete blobs[key] },
    },
  }
}

const adapters = [
  ['local', () => createBackend('local')],
  ['mock', () => createMockBackend()],
]

describe.each(adapters)('backend contract: %s', (_name, make) => {
  let backend
  let suffix = 0
  beforeEach(() => {
    localStorage.clear()
    backend = make()
    suffix += 1
  })

  describe('auth', () => {
    it('starts with no session, signs in, notifies, and signs out', async () => {
      expect(await backend.auth.getSession()).toBeNull()

      const events = []
      const unsub = backend.auth.onAuthStateChange((s) => events.push(s))

      const session = await backend.auth.signIn({ email: 'me@pritesh.net', password: 'x' })
      expect(session.user.email).toContain('pritesh')
      expect(await backend.auth.getSession()).not.toBeNull()
      expect(events.at(-1)?.user).toBeTruthy()

      await backend.auth.signOut()
      expect(await backend.auth.getSession()).toBeNull()
      expect(events.at(-1)).toBeNull()

      unsub()
    })
  })

  describe('store', () => {
    it('upserts, lists, and removes records', async () => {
      const c = 'ideas'
      expect(await backend.store.list(c)).toEqual([])

      await backend.store.upsert(c, [
        { id: '1', title: 'a', updatedAt: '2026-01-01T00:00:00Z' },
        { id: '2', title: 'b', updatedAt: '2026-01-01T00:00:00Z' },
      ])
      expect(await backend.store.list(c)).toHaveLength(2)

      // upsert is idempotent by id
      await backend.store.upsert(c, [{ id: '1', title: 'a2', updatedAt: '2026-02-01T00:00:00Z' }])
      const rows = await backend.store.list(c)
      expect(rows).toHaveLength(2)
      expect(rows.find((r) => r.id === '1').title).toBe('a2')

      await backend.store.remove(c, ['1'])
      expect((await backend.store.list(c)).map((r) => r.id)).toEqual(['2'])
    })

    it('pull(since) returns only records changed after the timestamp', async () => {
      const c = 'boards'
      await backend.store.upsert(c, [
        { id: 'old', updatedAt: '2026-01-01T00:00:00Z' },
        { id: 'new', updatedAt: '2026-06-01T00:00:00Z' },
      ])
      const changed = await backend.store.pull(c, '2026-03-01T00:00:00Z')
      expect(changed.map((r) => r.id)).toEqual(['new'])
    })
  })

  describe('blobs', () => {
    it('uploads, resolves a url, and removes', async () => {
      const key = `user/u1/artists/a1/${suffix}-${Date.now()}.jpg`
      const dataUrl = 'data:image/jpeg;base64,QUJD'

      const res = await backend.blobs.upload('u1', key, dataUrl, 'image/jpeg')
      expect(res.key).toBe(key)
      expect(await backend.blobs.getUrl(key)).toBe(dataUrl)

      await backend.blobs.remove(key)
      expect(await backend.blobs.getUrl(key)).toBe('')
    })
  })
})
