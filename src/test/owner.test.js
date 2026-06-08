import { describe, it, expect } from 'vitest'
import { isOwner, OWNER_EMAIL } from '../backend/owner'

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
