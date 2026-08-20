// iOS can't register a web app as a share target (WebKit bug 194593), so
// share-to-Sable needs a Shortcut instead — this gate decides when to
// surface that setup path (#45).
export function isIOS(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  return /iPhone|iPad|iPod/.test(userAgent || '')
}

// Set once the Shortcut has been built and shared as an iCloud link (Shortcuts
// app → Share → Copy iCloud Link). Empty until then, in which case Settings
// falls back to the manual four-step recipe.
export function getShareShortcutUrl() {
  return import.meta.env.VITE_IOS_SHORTCUT_URL || ''
}
