import Logo from '../components/Logo'
import BackupPanel from '../components/BackupPanel'
import { useAuth } from '../context/useAuth'

export default function Settings({ artists, setArtists, ideas, setIdeas, boards, setBoards, concepts, setConcepts, conventionOverrides, setConventionOverrides }) {
  const auth = useAuth()

  return (
    <div className="min-h-screen bg-ink-black max-w-5xl mx-auto px-4 md:px-8 pt-safe-top pb-24">
      {/* Header */}
      <div className="pt-10 pb-6">
        <Logo size={28} className="mb-3" />
        <h1 className="font-display text-5xl text-cream leading-none tracking-tight">Settings</h1>
        <p className="font-mono text-xs text-cream-muted/90 mt-3 tracking-widest">
          Backup, account &amp; appearance
        </p>
      </div>

      {/* Account */}
      {auth?.user && (
        <div className="bg-ink-card border border-ink-border rounded-sm p-4 mb-8">
          <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-1">Account</p>
          <div className="flex items-center justify-between gap-4">
            <p className="text-cream text-sm font-mono">{auth.user.email}</p>
            <button
              onClick={() => auth.signOut()}
              className="px-4 py-2 border border-ink-border hover:border-cream-muted/50 text-cream-muted hover:text-accent text-sm font-body rounded-sm transition-colors"
            >
              Sign out
            </button>
          </div>
          <p className="text-cream-muted/60 text-xs font-body mt-2 leading-relaxed">
            Signing out clears this device's copy of your data. It syncs back when you sign in again.
          </p>
        </div>
      )}

      <BackupPanel
        artists={artists}
        setArtists={setArtists}
        ideas={ideas}
        setIdeas={setIdeas}
        boards={boards}
        setBoards={setBoards}
        concepts={concepts}
        setConcepts={setConcepts}
        conventionOverrides={conventionOverrides}
        setConventionOverrides={setConventionOverrides}
      />

      {/* Appearance pointer */}
      <div className="bg-ink-card border border-ink-border rounded-sm p-4">
        <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-1">Appearance</p>
        <p className="text-cream-muted/90 text-sm font-body leading-relaxed">
          Theme (◑) and font size (A+) live in the top-right corner on every page. They're per-device and don't sync.
        </p>
      </div>
    </div>
  )
}
