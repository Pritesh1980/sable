// The single owner account (Pritesh) keeps the curated DEFAULT_ARTISTS seed;
// every other account starts empty. Email is configurable so the rule isn't
// hard-coded to one address.

export const OWNER_EMAIL = (import.meta.env?.VITE_OWNER_EMAIL || 'owner@example.com').toLowerCase()

export function isOwner(user) {
  return Boolean(user?.email) && user.email.toLowerCase() === OWNER_EMAIL
}
