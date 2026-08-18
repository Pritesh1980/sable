import { describe, it, expect, beforeEach } from 'vitest'
import { createBackend } from '../backend'

// #28: local/localStore.js namespaced everything under one global
// `tattoo_remote_<collection>` key with no per-user segment, so under the
// local backend every signed-in account on the same browser shared the same
// simulated remote rows.
describe('local store per-user isolation (#28)', () => {
  beforeEach(() => localStorage.clear())

  it('does not let one user see another user\'s upserted rows', async () => {
    const backend = createBackend('local')

    await backend.auth.signIn({ email: 'a@studio.com', password: 'x' })
    await backend.store.upsert('ideas', [{ id: '1', title: 'A idea', updatedAt: '2026-01-01T00:00:00Z' }])
    expect((await backend.store.list('ideas')).map((r) => r.id)).toEqual(['1'])

    await backend.auth.signIn({ email: 'b@studio.com', password: 'x' })
    expect(await backend.store.list('ideas')).toEqual([])

    await backend.store.upsert('ideas', [{ id: '2', title: 'B idea', updatedAt: '2026-01-01T00:00:00Z' }])
    expect((await backend.store.list('ideas')).map((r) => r.id)).toEqual(['2'])

    await backend.auth.signIn({ email: 'a@studio.com', password: 'x' })
    expect((await backend.store.list('ideas')).map((r) => r.id)).toEqual(['1'])
  })

  it('falls back to a single anonymous namespace when signed out, unchanged from today', async () => {
    const backend = createBackend('local')
    await backend.store.upsert('ideas', [{ id: '1', title: 'anon idea', updatedAt: '2026-01-01T00:00:00Z' }])
    expect((await backend.store.list('ideas')).map((r) => r.id)).toEqual(['1'])
  })

  // #28 review (codex + agy): namespacing changed the storage key from
  // `tattoo_remote_<collection>` to `tattoo_remote_<namespace>_<collection>` —
  // an existing local/demo installation's data would otherwise appear wiped.
  it('migrates data from the pre-namespacing legacy key on first read', async () => {
    localStorage.setItem(
      'tattoo_remote_ideas',
      JSON.stringify([{ id: 'legacy', title: 'pre-existing demo idea', updatedAt: '2026-01-01T00:00:00Z' }])
    )

    const backend = createBackend('local')
    expect((await backend.store.list('ideas')).map((r) => r.id)).toEqual(['legacy'])

    // And it's genuinely migrated, not re-read from the legacy key each time.
    localStorage.removeItem('tattoo_remote_ideas')
    expect((await backend.store.list('ideas')).map((r) => r.id)).toEqual(['legacy'])
  })
})
