import { getSupabaseClient } from './client'

// One Postgres table for every collection (maps cleanly to a DynamoDB single
// table later):
//   collections(user_id uuid, kind text, id text, data jsonb,
//               updated_at timestamptz, primary key(user_id, kind, id))
// Row-level security must enforce `using (auth.uid() = user_id)` on all ops, so
// reads/deletes are implicitly scoped to the signed-in user; inserts set user_id.
const TABLE = 'collections'

const KIND = {
  ideas: 'idea',
  concepts: 'concept',
  boards: 'board',
  artistsMeta: 'artistMeta',
  conventionOverrides: 'conventionOverrides',
}
const kindFor = (collection) => KIND[collection] || collection

// The full record is stored in `data`; id/updatedAt are also broken out as
// columns for keys and `pull(since)` filtering.
const rowToRecord = (row) => ({ ...(row.data || {}), id: row.id, updatedAt: row.updated_at })

export function createSupabaseStore() {
  const sb = getSupabaseClient()

  async function currentUserId() {
    const { data } = await sb.auth.getSession()
    return data.session?.user?.id
  }

  return {
    async list(collection) {
      const { data, error } = await sb
        .from(TABLE)
        .select('id,data,updated_at')
        .eq('kind', kindFor(collection))
      if (error) throw new Error(error.message)
      return (data || []).map(rowToRecord)
    },
    async upsert(collection, rows = []) {
      if (!rows.length) return rows
      const userId = await currentUserId()
      const kind = kindFor(collection)
      const payload = rows.map((r) => ({
        kind,
        id: r.id,
        data: r,
        updated_at: r.updatedAt || new Date().toISOString(),
      }))
      // A bare upsert is arrival-order, not last-write-wins: nothing compares
      // the incoming updated_at against the stored one, so a delayed older
      // write can overwrite a newer row and walk updated_at backwards (#56).
      // upsert_many_if_newer (supabase/schema.sql) enforces the comparison
      // atomically, one row at a time, inside a single statement — one RPC
      // call for the whole batch, not one per row, so a batch can't be left
      // half-committed by a mid-batch network failure the way N independent
      // RPC calls under Promise.all could. A resolved call with no error may
      // still be a legitimate no-op for any row whose stored copy was newer.
      const { error } = await sb.rpc('upsert_many_if_newer', { p_user_id: userId, p_rows: payload })
      if (error) throw new Error(error.message)
      return rows
    },
    async remove(collection, ids = []) {
      if (!ids.length) return
      const { error } = await sb
        .from(TABLE)
        .delete()
        .eq('kind', kindFor(collection))
        .in('id', ids)
      if (error) throw new Error(error.message)
    },
    async pull(collection, since) {
      let query = sb.from(TABLE).select('id,data,updated_at').eq('kind', kindFor(collection))
      if (since) query = query.gt('updated_at', since)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      return (data || []).map(rowToRecord)
    },
  }
}
