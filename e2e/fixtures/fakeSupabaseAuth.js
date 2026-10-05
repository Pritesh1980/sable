// Only vite.refinement.config.js aliases this adapter. No SDK or real account.
const KEY = 'refinement-fixture-session'
export function createSupabaseAuth() {
  const listeners = new Set()
  const session = () => JSON.parse(localStorage.getItem(KEY) || 'null')
  const notify = () => { for (const listener of listeners) listener(session()) }
  window.addEventListener('storage', event => { if (event.key === KEY) notify() })
  window.addEventListener('refinement-fixture-signout', () => { localStorage.removeItem(KEY); notify() })
  return {
    getSession: async () => session(),
    getAccessToken: async () => session() ? 'refinement-fixture-token-not-a-real-jwt' : null,
    signIn: async () => { throw new Error('Fixture sign-in is seeded by the test') },
    signOut: async () => { localStorage.removeItem(KEY); notify() },
    onAuthStateChange(callback) { listeners.add(callback); return () => listeners.delete(callback) },
  }
}
