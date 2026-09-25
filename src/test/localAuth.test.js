import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalAuth } from '../backend/local/localAuth'

beforeEach(() => localStorage.clear())

// The offline/demo sign-in accepts any credentials by design, but the email
// becomes part of storage and blob keys (`local-<email>`), so it must at least
// be a plausible, bounded email address.
describe('local auth sign-in', () => {
  it('signs in with a normal email, normalised', async () => {
    const auth = createLocalAuth()
    const session = await auth.signIn({ email: '  Me@Example.COM ' })
    expect(session.user).toEqual({ id: 'local-me@example.com', email: 'me@example.com' })
    expect(JSON.parse(localStorage.getItem('tattoo_local_session')).user.id).toBe('local-me@example.com')
  })

  it.each([
    ['empty', ''],
    ['no @', 'me.example.com'],
    ['two @', 'me@x@example.com'],
    ['no domain dot', 'me@example'],
    ['whitespace inside', 'me @example.com'],
    ['path separator', 'me/../x@example.com'],
    ['backslash', 'me\\x@example.com'],
    ['over 254 characters', `${'a'.repeat(250)}@example.com`],
  ])('refuses %s, and stores nothing', async (_label, email) => {
    const auth = createLocalAuth()
    await expect(auth.signIn({ email })).rejects.toThrow(/valid email/i)
    expect(localStorage.getItem('tattoo_local_session')).toBeNull()
  })
})
