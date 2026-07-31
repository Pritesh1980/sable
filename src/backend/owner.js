// The single owner account (Pritesh) keeps the curated DEFAULT_ARTISTS seed;
// every other account starts empty. Email is configurable so the rule isn't
// hard-coded to one address.

export const OWNER_EMAIL = (import.meta.env?.VITE_OWNER_EMAIL || 'owner@example.com').toLowerCase()

export function isOwner(user) {
  return Boolean(user?.email) && user.email.toLowerCase() === OWNER_EMAIL
}

// Whether this build ships the curated seed at all. The backend-free demo
// (GitHub Pages) does not: the reference images are gitignored third-party
// work, so seeding there yields broken monograms and hundreds of 404s for
// anyone signing in as the owner — and OWNER_EMAIL's fallback is guessable.
// Opt-out, so local dev and a real deploy keep seeding by default.
export const OWNER_SEED_ENABLED = import.meta.env?.VITE_OWNER_SEED !== '0'

// Identity and seeding are deliberately separate: isOwner still answers "is
// this the owner", this answers "should this session get DEFAULT_ARTISTS".
export function seedsOwnerData(user, enabled = OWNER_SEED_ENABLED) {
  return enabled && isOwner(user)
}
