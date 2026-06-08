import { useContext } from 'react'
import { AuthContext } from './auth-context'

// Returns { user, session, loading, signIn, signOut } when inside an
// AuthProvider, or null outside one (e.g. unit tests that don't need auth — the
// storage hooks treat a null/absent user as "offline, skip sync").
export function useAuth() {
  return useContext(AuthContext)
}
