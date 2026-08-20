import Logo from '../components/Logo'
import BackupPanel from '../components/BackupPanel'
import { useAuth } from '../context/useAuth'
import { isIOS, getShareShortcutUrl } from '../data/platform'

const MANAGING_ARTISTS_GUIDE_URL =
  'https://github.com/Pritesh1980/sable/blob/main/docs/02-managing-artists.md#share-a-screenshot-straight-from-instagram'

export default function Settings({ artists, setArtists, ideas, setIdeas, boards, setBoards, concepts, setConcepts, conventionOverrides, setConventionOverrides }) {
  const auth = useAuth()
  const onIOS = isIOS()
  const shortcutUrl = onIOS ? getShareShortcutUrl() : ''

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
        <div className="bg-ink-card border border-ink-border rounded-xs p-4 mb-8">
          <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-1">Account</p>
          <div className="flex items-center justify-between gap-4">
            <p className="text-cream text-sm font-mono">{auth.user.email}</p>
            <button
              onClick={() => auth.signOut()}
              className="px-4 min-h-11 border border-ink-border hover:border-cream-muted/50 text-cream-muted hover:text-accent text-sm font-body rounded-xs transition-colors"
            >
              Sign out
            </button>
          </div>
          <p className="text-cream-muted/60 text-xs font-body mt-2 leading-relaxed">
            Signing out clears this device's copy of your data. It syncs back when you sign in again.
          </p>
        </div>
      )}

      {/* #45: Safari can't register a web app as a share target, so iPhone
          needs a Shortcut instead of the one-tap Share → Sable Android and
          desktop Chrome get. Surfaced only on iOS, where it's relevant. */}
      {onIOS && (
        <div className="bg-ink-card border border-ink-border rounded-xs p-4 mb-8">
          <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-1">Share to Sable</p>
          {shortcutUrl ? (
            <>
              <p className="text-cream-muted/90 text-sm font-body leading-relaxed mb-3">
                Install the Shortcut once, then Share → Sable from Instagram drops a
                screenshot straight into the add-artist form.
              </p>
              <a
                href={shortcutUrl}
                className="inline-flex items-center px-4 min-h-11 border border-accent/40 hover:border-accent text-accent hover:text-cream text-sm font-body rounded-xs transition-colors"
              >
                Install Share to Sable
              </a>
            </>
          ) : (
            <p className="text-cream-muted/90 text-sm font-body leading-relaxed">
              Safari doesn't let web apps register as share destinations, so sharing a
              screenshot in from Instagram needs a one-off Shortcut. Follow the{' '}
              <a
                href={MANAGING_ARTISTS_GUIDE_URL}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:text-accent-hover underline"
              >
                setup guide
              </a>{' '}
              — it takes about a minute.
            </p>
          )}
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
      <div className="bg-ink-card border border-ink-border rounded-xs p-4">
        <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-1">Appearance</p>
        <p className="text-cream-muted/90 text-sm font-body leading-relaxed">
          Theme (◑) and font size (A+) live in the top-right corner on every page. They're per-device and don't sync.
        </p>
      </div>
    </div>
  )
}
