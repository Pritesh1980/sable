import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const seenAtCreate = { flag: null }
const mockSb = {
  auth: {
    updateUser: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
}
vi.mock('../backend/supabase/client', () => ({
  getSupabaseClient: () => {
    seenAtCreate.flag = localStorage.getItem('tattoo_pw_recovery')
    return mockSb
  },
}))
const { createSupabaseAuth } = await import('../backend/supabase/supabaseAuth')

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  window.location.hash = ''
})
afterEach(() => { window.location.hash = '' })

describe('supabase auth: recovery persistence', () => {
  it('a recovery hash sets pending before the client is created', () => {
    window.location.hash = '#access_token=x&type=recovery'
    const auth = createSupabaseAuth()
    expect(seenAtCreate.flag).toBe('1')
    expect(auth.recoveryPending()).toBe(true)
  })

  it('a plain load is not pending', () => {
    expect(createSupabaseAuth().recoveryPending()).toBe(false)
  })

  it('the flag survives a reload (new adapter, no hash)', () => {
    window.location.hash = '#type=recovery'
    createSupabaseAuth()
    window.location.hash = ''
    expect(createSupabaseAuth().recoveryPending()).toBe(true)
  })

  it('the PASSWORD_RECOVERY event sets pending', () => {
    let handler
    mockSb.auth.onAuthStateChange.mockImplementation((h) => {
      handler = h
      return { data: { subscription: { unsubscribe() {} } } }
    })
    const auth = createSupabaseAuth()
    auth.onAuthStateChange(() => {})
    handler('PASSWORD_RECOVERY', { user: { id: 'u', email: 'e@x.co' } })
    expect(auth.recoveryPending()).toBe(true)
  })

  it('updatePassword success clears it; failure keeps it', async () => {
    localStorage.setItem('tattoo_pw_recovery', '1')
    const auth = createSupabaseAuth()
    mockSb.auth.updateUser.mockResolvedValue({ error: { message: 'weak' } })
    await expect(auth.updatePassword({ password: 'x' })).rejects.toThrow('weak')
    expect(auth.recoveryPending()).toBe(true)
    mockSb.auth.updateUser.mockResolvedValue({ error: null })
    await auth.updatePassword({ password: 'longenough1' })
    expect(auth.recoveryPending()).toBe(false)
  })

  it('signOut clears it', async () => {
    localStorage.setItem('tattoo_pw_recovery', '1')
    mockSb.auth.signOut.mockResolvedValue({ error: null })
    const auth = createSupabaseAuth()
    await auth.signOut()
    expect(auth.recoveryPending()).toBe(false)
  })
})

describe('supabase auth: failed link', () => {
  it('reports the error code once', () => {
    window.location.hash = '#error=access_denied&error_code=otp_expired&error_description=gone'
    const auth = createSupabaseAuth()
    expect(auth.consumeAuthLinkError()).toBe('otp_expired')
    expect(auth.consumeAuthLinkError()).toBeNull()
  })

  it('is null without an error_code', () => {
    window.location.hash = '#access_token=x&type=recovery'
    expect(createSupabaseAuth().consumeAuthLinkError()).toBeNull()
  })
})
