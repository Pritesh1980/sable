import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// supabase/schema.sql is applied by hand in the Supabase SQL editor (see the
// README), never imported or executed by the test suite — so nothing here
// can prove the SQL actually behaves correctly against a live database. What
// this guards against is a *silent regression*: src/test/supabaseStore.test.js
// mocks sb.rpc and can only prove the JS call contract (right function name,
// right args) — it would pass identically whether or not the recency WHERE
// clause, or `security invoker`, was ever actually in the function body.
// Mirrors the existing public/sw.js contract-test pattern (precache.test.js,
// swStrategy.test.js) for the same reason: a file Vitest can't import still
// needs its key invariants pinned somewhere.
describe('supabase/schema.sql: upsert_many_if_newer contract (#56)', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/schema.sql'), 'utf8')

  it('defines upsert_many_if_newer', () => {
    expect(sql).toMatch(/create or replace function public\.upsert_many_if_newer/)
  })

  it('runs as security invoker, not definer, so RLS keeps applying', () => {
    expect(sql).toMatch(/security invoker/)
    expect(sql).not.toMatch(/security definer/)
  })

  it('only updates a conflicting row when the incoming write is newer', () => {
    expect(sql).toMatch(/where\s+collections\.updated_at\s*<\s*excluded\.updated_at/)
  })

  it('upserts on the same key the table is scoped and indexed by', () => {
    expect(sql).toMatch(/on conflict \(user_id, kind, id\) do update/)
  })

  it('collections.updated_at stays not-null, so the recency comparison can never short-circuit on NULL', () => {
    expect(sql).toMatch(/updated_at\s+timestamptz\s+not null/)
  })
})
