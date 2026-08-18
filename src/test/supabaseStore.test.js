import { describe, it, expect, vi, beforeEach } from 'vitest'

// #56: a bare `.upsert()` is arrival-order, not last-write-wins — an older
// write that lands late on the network can overwrite a newer stored row and
// walk `updated_at` backwards. The fix moves the write behind a Postgres RPC
// (`upsert_many_if_newer`) that only applies each row when it's actually
// newer than what's stored, enforced atomically on the database side, in one
// statement for the whole batch. These tests mock `sb.rpc` directly — no live
// Supabase project is needed to prove the adapter calls it correctly; the SQL
// function itself (`supabase/schema.sql`) has to be applied against the real
// project separately, and its recency/security invariants are guarded by the
// text-level contract test in `supabaseSchemaContract.test.js` — a mocked
// `sb.rpc` can prove the JS call contract but can't prove the SQL is correct,
// since it would return the exact same `{ error: null }` whether or not the
// WHERE clause (or security invoker) was ever actually there.

const mockSb = {
  auth: { getSession: vi.fn() },
  rpc: vi.fn(),
  from: vi.fn(),
}

vi.mock('../backend/supabase/client', () => ({
  getSupabaseClient: () => mockSb,
}))

const { createSupabaseStore } = await import('../backend/supabase/supabaseStore')

describe('supabaseStore.upsert (#56: write recency)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSb.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } })
    mockSb.rpc.mockResolvedValue({ error: null })
  })

  it('calls the upsert_many_if_newer RPC once for the whole batch, scoped to the signed-in user', async () => {
    const store = createSupabaseStore()
    const rows = [
      { id: 'a', title: 'Idea A', updatedAt: '2026-08-01T00:00:00.000Z' },
      { id: 'b', title: 'Idea B', updatedAt: '2026-08-02T00:00:00.000Z' },
    ]

    await store.upsert('ideas', rows)

    expect(mockSb.rpc).toHaveBeenCalledTimes(1)
    expect(mockSb.rpc).toHaveBeenCalledWith('upsert_many_if_newer', {
      p_user_id: 'user-1',
      p_rows: [
        { kind: 'idea', id: 'a', data: rows[0], updated_at: '2026-08-01T00:00:00.000Z' },
        { kind: 'idea', id: 'b', data: rows[1], updated_at: '2026-08-02T00:00:00.000Z' },
      ],
    })
  })

  it('never calls the old unconditional table upsert', async () => {
    const store = createSupabaseStore()
    await store.upsert('ideas', [{ id: 'a', updatedAt: '2026-08-01T00:00:00.000Z' }])
    expect(mockSb.from).not.toHaveBeenCalled()
  })

  it('returns the rows unchanged, same as before', async () => {
    const store = createSupabaseStore()
    const rows = [{ id: 'a', updatedAt: '2026-08-01T00:00:00.000Z' }]
    const result = await store.upsert('ideas', rows)
    expect(result).toBe(rows)
  })

  it('does nothing and never calls rpc for an empty row list', async () => {
    const store = createSupabaseStore()
    await store.upsert('ideas', [])
    expect(mockSb.rpc).not.toHaveBeenCalled()
  })

  it('a DB-side no-op (a stale row in the batch silently rejected by the RPC) does not throw', async () => {
    // The RPC's `where collections.updated_at < excluded.updated_at` can
    // leave some rows in the batch untouched without that being a Postgres
    // *error* — it's a normal, silent per-row no-op. Only `error` matters.
    mockSb.rpc.mockResolvedValue({ error: null, data: null })
    const store = createSupabaseStore()
    await expect(
      store.upsert('ideas', [{ id: 'a', updatedAt: '2026-08-01T00:00:00.000Z' }])
    ).resolves.toEqual([{ id: 'a', updatedAt: '2026-08-01T00:00:00.000Z' }])
  })

  it('throws when the RPC reports an error', async () => {
    mockSb.rpc.mockResolvedValue({ error: { message: 'permission denied' } })
    const store = createSupabaseStore()
    await expect(
      store.upsert('ideas', [{ id: 'a', updatedAt: '2026-08-01T00:00:00.000Z' }])
    ).rejects.toThrow('permission denied')
  })

  it('falls back to the current time when a row has no updatedAt', async () => {
    const store = createSupabaseStore()
    await store.upsert('ideas', [{ id: 'a' }])
    const [, { p_rows }] = mockSb.rpc.mock.calls[0]
    expect(p_rows[0].updated_at).toEqual(expect.any(String))
    expect(new Date(p_rows[0].updated_at).toString()).not.toBe('Invalid Date')
  })
})
