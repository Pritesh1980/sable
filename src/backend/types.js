// Backend adapter interfaces (JSDoc typedefs — this repo is plain JS, no TS).
//
// All vendor SDKs are quarantined under src/backend/<vendor>/. The app only ever
// imports these interface shapes via the createBackend() factory in ./index.js,
// so swapping Supabase → AWS later means writing one new adapter, not touching
// pages/components/hooks.

/**
 * @typedef {Object} User
 * @property {string} id     Stable per-user id (Supabase auth.uid / Cognito sub).
 * @property {string} email
 */

/**
 * @typedef {Object} Session
 * @property {User} user
 */

/**
 * Authentication. No signUp — accounts are created admin-side (invite-only scope).
 * @typedef {Object} AuthClient
 * @property {() => Promise<Session|null>} getSession
 * @property {(creds: {email: string, password: string}) => Promise<Session>} signIn
 * @property {() => Promise<void>} signOut
 * @property {(cb: (session: Session|null) => void) => (() => void)} onAuthStateChange
 *   Subscribe to auth changes; returns an unsubscribe fn.
 */

/**
 * @typedef {Object} Record
 * @property {string} id
 * @property {string} updatedAt  ISO timestamp — drives last-write-wins reconcile.
 */

/**
 * One document store for every collection
 * (ideas | concepts | boards | artistsMeta | conventionOverrides).
 * Scoped per-user by the adapter (RLS on Supabase, API authorizer on AWS).
 * @typedef {Object} RemoteStore
 * @property {(collection: string) => Promise<Record[]>} list
 * @property {(collection: string, rows: Record[]) => Promise<Record[]>} upsert
 * @property {(collection: string, ids: string[]) => Promise<void>} remove
 * @property {(collection: string, since?: string) => Promise<Record[]>} pull
 *   Records changed strictly after the `since` ISO timestamp (all when omitted).
 */

/**
 * Binary storage for images. `getUrl` is ALWAYS treated as short-lived /
 * refetchable — store the *key* in data, resolve to a URL at render time so
 * Supabase signed URLs and S3 presigned URLs stay interchangeable.
 * @typedef {Object} BlobStore
 * @property {(userId: string, key: string, blob: Blob, contentType: string) => Promise<{key: string}>} upload
 * @property {(key: string) => Promise<string>} getUrl
 * @property {(key: string) => Promise<void>} remove
 */

/**
 * @typedef {Object} Backend
 * @property {string} kind  'local' | 'supabase' | 'aws'
 * @property {AuthClient} auth
 * @property {RemoteStore} store
 * @property {BlobStore} blobs
 */

export {}
