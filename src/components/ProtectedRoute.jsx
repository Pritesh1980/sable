import { Fragment, useState } from 'react'
import { useAuth } from '../context/useAuth'
import { backend } from '../backend'
import Login from '../pages/Login'
import { LogoMark } from './Logo'

// Gate: spinner while the session is resolving, the Login screen when signed
// out, the app when signed in.
export default function ProtectedRoute({ children }) {
  const { user, loading, signOut } = useAuth()
  const [signOutError, setSignOutError] = useState(false)

  if (loading) {
    return (
      <div className="bg-ink-black min-h-screen flex items-center justify-center">
        <LogoMark size={40} className="text-cream-muted/40 animate-pulse" />
      </div>
    )
  }

  if (!user) return <Login />

  if (backend.capabilities.realAuth && (!backend.privateOwnerId || user.id !== backend.privateOwnerId)) {
    return (
      <div className="bg-v2-ink min-h-screen flex items-center justify-center px-6 text-v2-cream">
        <div className="max-w-sm text-center">
          <h1 className="font-v2-display text-2xl">{backend.privateOwnerId ? 'Access denied' : 'Private access is not configured'}</h1>
          <p className="font-v2-ui text-sm text-v2-muted mt-4">
            {backend.privateOwnerId ? 'This private library is available only to its configured owner.' : 'Configure the private owner account before opening this library.'}
          </p>
          <button
            onClick={async () => {
              setSignOutError(false)
              try { await signOut() } catch { setSignOutError(true) }
            }}
            className="min-h-11 min-w-11 mt-6 px-5 border border-v2-hairline font-v2-ui focus-visible:outline-2 focus-visible:outline-v2-cream"
          >Sign out</button>
          {signOutError && <p role="alert" className="mt-3 font-v2-ui text-sm">Could not sign out. Please try again.</p>}
        </div>
      </div>
    )
  }

  return <Fragment key={user.id}>{children}</Fragment>
}
