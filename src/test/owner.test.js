import { describe, it, expect } from 'vitest'
import { isOwner, OWNER_EMAIL, seedsOwnerData } from '../backend/owner'

describe('isOwner', () => {
  it('matches the owner email case-insensitively', () => {
    expect(isOwner({ email: OWNER_EMAIL })).toBe(true)
    expect(isOwner({ email: OWNER_EMAIL.toUpperCase() })).toBe(true)
  })

  it('rejects other users and missing emails', () => {
    expect(isOwner({ email: 'someone@else.com' })).toBe(false)
    expect(isOwner({})).toBe(false)
    expect(isOwner(null)).toBe(false)
  })
})

// The public demo build ships without the curated reference images (they are
// third-party work and gitignored), so seeding DEFAULT_ARTISTS there produces
// a wall of broken monograms and hundreds of 404s for anyone who signs in as
// the owner — and OWNER_EMAIL's default is guessable. The seed is therefore
// switchable off at build time, independently of who the owner is.
describe('seedsOwnerData', () => {
  it('follows isOwner when seeding is enabled (the default)', () => {
    expect(seedsOwnerData({ email: OWNER_EMAIL }, true)).toBe(true)
    expect(seedsOwnerData({ email: 'someone@else.com' }, true)).toBe(false)
  })

  it('never seeds when the build disables it, even for the owner', () => {
    expect(seedsOwnerData({ email: OWNER_EMAIL }, false)).toBe(false)
    expect(seedsOwnerData({ email: OWNER_EMAIL.toUpperCase() }, false)).toBe(false)
  })

  it('leaves identity itself untouched — this gates seeding only', () => {
    expect(isOwner({ email: OWNER_EMAIL })).toBe(true)
  })
})
