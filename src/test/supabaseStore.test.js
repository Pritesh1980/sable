import { describe, it, expect, vi, beforeEach } from 'vitest'

// #56: a bare `.upsert()` is arrival-order, not last-write-wins — an older
// write that lands late on the network can overwrite a newer stored row and
// walk `updated_at` backwards. The fix moves the write behind a Postgres RPC
// (`upsert_if_newer`) that only applies when the incoming row is actually
// newer, enforced atomically on the database side. These tests mock `sb.rpc`
// directly — no live Supabase project is needed to prove the adapter calls it
// correctly; the SQL function itself (`supabase/schema.sql`) has to be applied
// against the real project separately.

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

  it('calls the upsert_if_newer RPC once per row with the row scoped to the signed-in user', async () => {
    const store = createSupabaseStore()
    const rows = [
      { id: 'a', title: 'Idea A', updatedAt: '2026-08-01T00:00:00.000Z' },
      { id: 'b', title: 'Idea B', updatedAt: '2026-08-02T00:00:00.000Z' },
    ]

    await store.upsert('ideas', rows)

    expect(mockSb.rpc).toHaveBeenCalledTimes(2)
    expect(mockSb.rpc).toHaveBeenNthCalledWith(1, 'upsert_if_newer', {
      p_user_id: 'user-1',
      p_kind: 'idea',
      p_id: 'a',
      p_data: rows[0],
      p_updated_at: '2026-08-01T00:00:00.000Z',
    })
    expect(mockSb.rpc).toHaveBeenNthCalledWith(2, 'upsert_if_newer', {
      p_user_id: 'user-1',
      p_kind: 'idea',
      p_id: 'b',
      p_data: rows[1],
      p_updated_at: '2026-08-02T00:00:00.000Z',
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

  it('a DB-side no-op (stale write silently rejected by the RPC) does not throw', async () => {
    // The RPC's `where collections.updated_at < excluded.updated_at` can decide
    // to update zero rows without that being a Postgres *error* — it's a normal,
    // silent no-op from the caller's point of view. Only `error` should matter.
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
    const call = mockSb.rpc.mock.calls[0][1]
    expect(call.p_updated_at).toEqual(expect.any(String))
    expect(new Date(call.p_updated_at).toString()).not.toBe('Invalid Date')
  })
})
