import { getSupabaseClient } from './client'

// Private Supabase Storage bucket. Keys are user-prefixed
// (user/<uid>/<scope>/<id>/<uuid>.jpg) for natural per-user isolation and a 1:1
// S3 prefix later. getUrl returns a short-lived signed URL — always treated as
// refetchable, so only the key is ever persisted.
const BUCKET = 'tattoo-images'
const SIGNED_URL_TTL = 3600

export function createSupabaseBlobs() {
  const sb = getSupabaseClient()
  return {
    async upload(_userId, key, blob, contentType) {
      const { error } = await sb.storage
        .from(BUCKET)
        .upload(key, blob, { contentType, upsert: true })
      if (error) throw new Error(error.message)
      return { key }
    },
    async getUrl(key) {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(key, SIGNED_URL_TTL)
      if (error) throw new Error(error.message)
      return data.signedUrl
    },
    async remove(key) {
      const { error } = await sb.storage.from(BUCKET).remove([key])
      if (error) throw new Error(error.message)
    },
  }
}
