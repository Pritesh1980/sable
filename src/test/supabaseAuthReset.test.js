import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSb = {
  auth: {
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
}
vi.mock('../backend/supabase/client', () => ({ getSupabaseClient: () => mockSb }))
const { createSupabaseAuth } = await import('../backend/supabase/supabaseAuth')

describe('supabase auth: password reset', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends the reset email with a redirect to the app base', async () => {
    mockSb.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    await createSupabaseAuth().requestPasswordReset({ email: 'a@b.co' })
    const [email, opts] = mockSb.auth.resetPasswordForEmail.mock.calls[0]
    expect(email).toBe('a@b.co')
    expect(opts.redirectTo).toBe(window.location.origin + import.meta.env.BASE_URL)
  })

  it('maps reset errors to plain Errors', async () => {
    mockSb.auth.resetPasswordForEmail.mockResolvedValue({ error: { message: 'rate limited' } })
    await expect(createSupabaseAuth().requestPasswordReset({ email: 'a@b.co' })).rejects.toThrow('rate limited')
  })

  it('updates the password via updateUser', async () => {
    mockSb.auth.updateUser.mockResolvedValue({ data: {}, error: null })
    await createSupabaseAuth().updatePassword({ password: 'longenough' })
    expect(mockSb.auth.updateUser).toHaveBeenCalledWith({ password: 'longenough' })
  })

  it('maps update errors', async () => {
    mockSb.auth.updateUser.mockResolvedValue({ error: { message: 'weak password' } })
    await expect(createSupabaseAuth().updatePassword({ password: 'x' })).rejects.toThrow('weak password')
  })

  it('flags PASSWORD_RECOVERY as { recovery: true } and no other event', () => {
    let handler
    mockSb.auth.onAuthStateChange.mockImplementation((h) => {
      handler = h
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    const cb = vi.fn()
    createSupabaseAuth().onAuthStateChange(cb)
    const session = { user: { id: 'u', email: 'a@b.co' }, access_token: 't' }
    handler('SIGNED_IN', session)
    handler('PASSWORD_RECOVERY', session)
    expect(cb).toHaveBeenNthCalledWith(1, { user: { id: 'u', email: 'a@b.co' } }, { recovery: false })
    expect(cb).toHaveBeenNthCalledWith(2, { user: { id: 'u', email: 'a@b.co' } }, { recovery: true })
  })

  it('local auth does not implement reset', async () => {
    const { createLocalAuth } = await import('../backend/local/localAuth')
    const a = createLocalAuth()
    expect(a.requestPasswordReset).toBeUndefined()
    expect(a.updatePassword).toBeUndefined()
  })
})
