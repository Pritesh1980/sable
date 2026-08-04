// Demo seed — a fully fictional dataset so a fresh clone (or a public demo
// visit) sees the Wall, Top-5 dock and gallery looking alive instead of
// monogram placeholders. The curated real-artist images are third-party work
// and gitignored; these artists are invented and their artwork is original,
// hand-authored SVG committed under public/images/demo/ (deliberate tattoo
// designs — botanical, celestial, sacred geometry, blackwork, architectural,
// dotwork, single-line — one coherent style per artist).
//
// Entry point: visit any route with `?demo=1` on the local backend
// (VITE_BACKEND=local, the default). Seeding writes the same localStorage keys
// the app's local-first storage reads — the offline cache (`tattoo_*`) AND the
// local backend's simulated remote store (`tattoo_remote_*`) — plus a local
// demo session, so sync reconciles to exactly this dataset. It never runs over
// an existing session and never touches non-local backends.

import { backend } from '../backend'
import { nowStamp } from '../backend/sync'

// `demo: true` is the ownership proof: localAuth.signIn writes only { user },
// so no login — even with this exact email — can produce a marked session.
export const DEMO_SESSION = {
  demo: true,
  user: { id: 'local-demo@example.com', email: 'demo@example.com' },
}

// Device-local, and deliberately outside the seeded collections: dismissing the
// intro is a preference about this browser, not demo data, so a re-seed (see
// DEMO_SEED_VERSION below) must not bring the strip back for someone who has
// already closed it.
export const DEMO_INTRO_KEY = 'tattoo_demo_intro_dismissed'

// Bump whenever the demo dataset changes shape (artists, image counts, art
// replaced). A returning visitor whose DEMO session carries an older version
// is re-seeded, so the public demo never shows a stale mix of old data and
// current files. Real (non-demo) sessions are never touched.
// v3: image paths went base-relative. Old v2 records hold /sable/-prefixed
// paths which resolveAssetPath still renders correctly, so this bump is about
// converging stored data on the canonical form rather than fixing a break.
export const DEMO_SEED_VERSION = 3

// Base-relative, deliberately. seedDemoData writes these straight into
// localStorage, so prefixing BASE_URL here would freeze the build's base into
// stored records — and a visitor seeded under /sable/ would keep those paths
// if the app ever moved. resolveAssetPath applies the base at display time,
// and rebases anything already stored (including the /sable/-prefixed paths
// the earlier version of this file wrote).
const demoImages = (id, count = 3) =>
  Array.from({ length: count }, (_, i) => `images/demo/${id}/${i + 1}.svg`)

// Fictional artists only — invented names and handles, no resemblance to the
// real artists in src/data/artists.js. Tags come from the canonical STYLE_TAGS.
export const DEMO_ARTISTS = [
  { id: 'mora.blackfern', handle: 'mora.blackfern', name: 'Mora Vane', tags: ['dark-illustrative', 'fine-line'], styleNote: 'Botanical fine-line — branching stems and seed heads drawn in airy off-white line over deep black.', images: demoImages('mora.blackfern'), rank: 1, status: 'shortlisted', notes: '', studio: null },
  { id: 'vesper_noctis', handle: 'vesper_noctis', name: 'Vesper Ash', tags: ['dark-fantasy', 'surrealism'], styleNote: 'Nocturnal surrealism — eclipsed moons, drifting wisps and star fields in moody black-and-grey.', images: demoImages('vesper_noctis'), rank: 2, status: 'contact-next', notes: '', studio: null },
  { id: 'hexen_atlas', handle: 'hexen_atlas', name: '', tags: ['blackwork', 'surrealism'], styleNote: 'Sacred geometry — concentric circles, polygons and radial spokes with a single red mark.', images: demoImages('hexen_atlas'), rank: 3, status: 'shortlisted', notes: '', studio: null },
  { id: 'ferrum_line', handle: 'ferrum_line', name: '', tags: ['blackwork'], styleNote: 'Bold brush blackwork — thick gestural swipes with dry-brush texture and heavy saturation.', images: demoImages('ferrum_line'), rank: 4, status: 'researching', notes: '', studio: null },
  { id: 'ashgrove.tattoo', handle: 'ashgrove.tattoo', name: '', tags: ['realism', 'dark-illustrative'], styleNote: 'Dotwork realism — depth built from thousands of fine stippled points; soft, smoky, patient.', images: demoImages('ashgrove.tattoo'), rank: 5, status: 'researching', notes: '', studio: null },
  { id: 'lekhani.ink', handle: 'lekhani.ink', name: 'Asha Lekhani', tags: ['fine-line', 'blackwork'], styleNote: 'Script & letterforms — names carried across writing systems: katakana, hanzi, Gujarati, each set like lettering, not type.', images: demoImages('lekhani.ink'), rank: 6, status: 'shortlisted', notes: '', studio: null },
]

export const DEMO_IDEAS = [
  {
    id: 'demo-idea-forest',
    title: 'Night forest half-sleeve',
    description: 'Branching botanicals fading into a dark, starlit canopy. Fine line up top, denser black toward the elbow.',
    tags: ['dark-illustrative', 'fine-line'],
    placement: 'forearm',
    images: [{ url: `images/demo/mora.blackfern/2.svg`, note: 'Line density reference' }],
    linkedArtists: ['mora.blackfern'],
    status: 'idea',
  },
  {
    id: 'demo-idea-eclipse',
    title: 'Eclipse over still water',
    description: 'A near-total eclipse with thin drifting cloud lines below — quiet, heavy, mostly negative space.',
    tags: ['dark-fantasy', 'surrealism'],
    placement: 'upper arm',
    images: [{ url: `images/demo/vesper_noctis/1.svg`, note: 'Mood reference' }],
    linkedArtists: ['vesper_noctis'],
    status: 'booked',
  },
  {
    id: 'demo-idea-geometry',
    title: 'Radial geometry chest piece',
    description: 'Concentric circles and a broken polygon centred on the sternum; one small red accent.',
    tags: ['blackwork', 'surrealism'],
    placement: 'chest',
    images: [],
    linkedArtists: ['hexen_atlas'],
    status: 'idea',
  },
]

function write(storage, key, value) {
  storage.setItem(key, JSON.stringify(value))
}

// Seed the demo dataset into the given storage (localStorage by default):
// session + offline caches + the local backend's simulated remote rows.
export function seedDemoData(storage = localStorage) {
  const at = nowStamp()
  write(storage, 'tattoo_local_session', DEMO_SESSION)
  write(storage, 'tattoo_artists_meta', DEMO_ARTISTS.map((a) => ({ ...a, updatedAt: at })))
  write(storage, 'tattoo_remote_artistsMeta', DEMO_ARTISTS.map((a) => ({ ...a, updatedAt: at })))
  write(storage, 'tattoo_ideas', DEMO_IDEAS.map((i) => ({ ...i, updatedAt: at })))
  write(storage, 'tattoo_remote_ideas', DEMO_IDEAS.map((i) => ({ ...i, updatedAt: at })))
  // Demo images are static paths — nothing to migrate to blob storage.
  storage.setItem('tattoo_img_migrated_v1', '1')
  storage.setItem('tattoo_demo_seed_version', String(DEMO_SEED_VERSION))
}

// Is the current session one the seeder created? Same `demo: true` proof the
// re-seed logic uses — localAuth.signIn writes only { user }, so a real
// sign-in can never look like one. Used to decide whether offering the demo
// makes sense; never to grant anything.
export function isDemoSession() {
  try {
    return JSON.parse(localStorage.getItem('tattoo_local_session'))?.demo === true
  } catch {
    return false
  }
}

// Whether to offer the demo from an empty signed-in wall.
//
// Narrow on purpose. Reaching the demo from inside a session means signing out
// first (maybeSeedDemo refuses to write over an existing session), and seeding
// then overwrites the `tattoo_*` keys — which on a local dev machine could be
// real ideas or boards belonging to a wall that merely has no artists yet.
// `ownerSeedEnabled === false` is set by one thing only, the public demo
// deploy, where accounts are throwaway and there is nothing to lose.
export function canOfferDemo({ backendKind, ownerSeedEnabled, demoActive }) {
  return backendKind === 'local' && ownerSeedEnabled === false && !demoActive
}

// Two decisions, kept separate: first prove the session is the demo's own,
// then compare dataset versions. The version key is global and mutable, so it
// never participates in the ownership proof.
function isStaleDemoSession(raw) {
  try {
    const session = JSON.parse(raw)
    const version = Number(localStorage.getItem('tattoo_demo_seed_version'))
    // A missing or garbage version key on a proven demo session means a
    // pre-versioning deploy → stale. A version from a NEWER deploy (rollback
    // in flight) is left alone — never downgrade.
    const stale = !Number.isSafeInteger(version) || version < DEMO_SEED_VERSION
    if (session?.demo === true) return stale
    // Legacy window: v1 sessions predate the marker, so the demo user id plus
    // pre-v2 evidence is the best proof available. From v2 on every seeded
    // session is marked, so an unmarked session with a current version key is
    // a real login (possibly with the demo email) and is never touched.
    return (
      session?.user?.id === DEMO_SESSION.user.id &&
      (!Number.isSafeInteger(version) || version < 2)
    )
  } catch {
    return false // unparseable session → treat as real, leave alone
  }
}

// Boot-time hook (called from main.jsx before render). Creating a demo session
// from nothing requires `?demo=1` and no existing session; but a proven demo
// session whose stored dataset predates the shipped files re-seeds on ANY boot
// — an installed PWA launches from start_url '/' without the query. A real
// user's session is never overwritten. Returns true if it seeded.
export function maybeSeedDemo(location = window.location, backendKind = backend.kind) {
  if (backendKind !== 'local') return false
  try {
    const raw = localStorage.getItem('tattoo_local_session')
    if (raw) {
      if (!isStaleDemoSession(raw)) return false
    } else if (new URLSearchParams(location.search || '').get('demo') !== '1') {
      return false
    }
    seedDemoData(localStorage)
    return true
  } catch {
    return false
  }
}
