import { useAuth } from '../context/useAuth'
import Login from '../pages/Login'
import { LogoMark } from './Logo'

// Gate: spinner while the session is resolving, the Login screen when signed
// out, the app when signed in.
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="bg-ink-black min-h-screen flex items-center justify-center">
        <LogoMark size={40} className="text-cream-muted/40 animate-pulse" />
      </div>
    )
  }

  if (!user) return <Login />

  return children
}
