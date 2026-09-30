// Offline seed preference only — email is never private-access authorization.
// Real-auth access is gated on backend.privateOwnerId (the immutable auth sub).

export const OWNER_EMAIL = (import.meta.env?.VITE_OWNER_EMAIL || 'owner@example.com').toLowerCase()

export function isOwner(user) {
  return Boolean(user?.email) && user.email.toLowerCase() === OWNER_EMAIL
}

// Whether this build ships the curated seed at all. The backend-free demo
// (GitHub Pages) does not: the reference images are gitignored third-party
// work, so seeding there yields broken monograms and hundreds of 404s for
// anyone signing in as the owner — and OWNER_EMAIL's fallback is guessable.
// Opt-out for offline builds; real auth separately disables email-based seeds.
export const OWNER_SEED_ENABLED = import.meta.env?.VITE_OWNER_SEED !== '0'

// Preserve the offline helper default for existing callers/tests. Runtime
// hooks must pass their auth capability; real auth never seeds by email.
export function seedsOwnerData(user, enabled = OWNER_SEED_ENABLED, offlineAuth = true) {
  return offlineAuth && enabled && isOwner(user)
}
