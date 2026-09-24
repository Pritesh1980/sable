// Demo seed — a fully fictional dataset so a fresh clone (or a public demo
// visit) sees the Wall, Top-5 dock and gallery looking alive instead of
// monogram placeholders. The curated real-artist images are third-party work
// and gitignored; these artists are invented and their artwork is original,
// AI-generated tattoo photography under public/images/demo/ (botanical,
// surrealist, Japanese-inspired, tribal, colour realism and brush lettering).
// These are synthetic concepts, not evidence of any real artist's work.
//
// Entry point: visit any route with `?demo=1` on the local backend
// (VITE_BACKEND=local, the default). Seeding writes the same localStorage keys
// the app's local-first storage reads — the offline cache (`tattoo_*`) AND the
// local backend's simulated remote store (`tattoo_remote_*`) — plus a local
// demo session, so sync reconciles to exactly this dataset. It never runs over
// an existing session and never touches non-local backends.

import { backend } from '../backend'
import { nowStamp } from '../backend/sync'
import { DEMO_ARTWORK } from './demoArtwork'

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
// v4: realistic synthetic portfolios, new immutable image URLs and matching ideas.
export const DEMO_SEED_VERSION = 4

// Base-relative, deliberately. seedDemoData writes these straight into
// localStorage, so prefixing BASE_URL here would freeze the build's base into
// stored records — and a visitor seeded under /sable/ would keep those paths
// if the app ever moved. resolveAssetPath applies the base at display time,
// and rebases anything already stored (including the /sable/-prefixed paths
// the earlier version of this file wrote).
const demoImages = (id) => DEMO_ARTWORK.filter((piece) => piece.artistId === id).map((piece) => piece.src)

// Fictional artists only — invented names and handles, no resemblance to the
// real artists in src/data/artists.js. Tags come from the canonical STYLE_TAGS.
export const DEMO_ARTISTS = [
  { id: 'mora.blackfern', handle: 'mora.blackfern', name: 'Mora Vane', tags: ['dark-illustrative', 'fine-line'], styleNote: 'Botanical fine-line — fern fronds, magnolia petals and meadow grasses with delicate black-and-grey shading.', images: demoImages('mora.blackfern'), rank: 1, status: 'shortlisted', notes: '', studio: null },
  { id: 'vesper_noctis', handle: 'vesper_noctis', name: 'Vesper Ash', tags: ['surrealism', 'realism'], styleNote: 'Surreal black-and-grey — an ocean inside an hourglass, fractured marble and stairways into impossible spaces.', images: demoImages('vesper_noctis'), rank: 2, status: 'contact-next', notes: '', studio: null },
  { id: 'hexen_atlas', handle: 'hexen_atlas', name: '', tags: ['dark-illustrative', 'realism'], styleNote: 'Japanese-inspired storytelling — samurai armour, koi and temple landscapes shaped around the body.', images: demoImages('hexen_atlas'), rank: 3, status: 'shortlisted', notes: '', studio: null },
  { id: 'ferrum_line', handle: 'ferrum_line', name: '', tags: ['blackwork'], styleNote: 'Contemporary tribal-inspired blackwork — bold interlocking shapes and clean negative space following the calf, shoulder and forearm.', images: demoImages('ferrum_line'), rank: 4, status: 'researching', notes: '', studio: null },
  { id: 'ashgrove.tattoo', handle: 'ashgrove.tattoo', name: '', tags: ['realism'], styleNote: 'Colour photorealism — a vivid kingfisher, a tiger portrait and a luminous teal gemstone with convincing depth.', images: demoImages('ashgrove.tattoo'), rank: 5, status: 'researching', notes: '', studio: null },
  { id: 'lekhani.ink', handle: 'lekhani.ink', name: 'Asha Lekhani', tags: ['fine-line', 'blackwork'], styleNote: 'Sumi-e-inspired brushwork — Gujarati, Japanese and Latin lettering concepts alongside abstract ink. Generated lettering is not a language-verified tattoo stencil.', images: demoImages('lekhani.ink'), rank: 6, status: 'shortlisted', notes: '', studio: null },
]

export const DEMO_IDEAS = [
  {
    id: 'demo-idea-forest',
    title: 'Botanical forearm study',
    description: 'A fern unfolding along the forearm, with delicate veins and soft black-and-grey shading. Keep breathing room between the fronds.',
    tags: ['dark-illustrative', 'fine-line'],
    placement: 'forearm',
    images: [{ url: 'images/demo/mora.blackfern/fern-v4.webp', note: 'Frond spacing and shading reference' }],
    linkedArtists: ['mora.blackfern'],
    status: 'idea',
  },
  {
    id: 'demo-idea-eclipse',
    title: 'Ocean in an hourglass',
    description: 'An impossible ocean held inside glass, with realistic reflections and a quiet, dreamlike atmosphere in black-and-grey.',
    tags: ['surrealism', 'realism'],
    placement: 'forearm',
    images: [{ url: 'images/demo/vesper_noctis/hourglass-v4.webp', note: 'Glass, water and tonal depth' }],
    linkedArtists: ['vesper_noctis'],
    status: 'booked',
  },
  {
    id: 'demo-idea-geometry',
    title: 'Samurai and mountain temple',
    description: 'A samurai in the foreground with a misty temple landscape above, composed to wrap naturally around the upper arm.',
    tags: ['dark-illustrative', 'realism'],
    placement: 'upper arm',
    images: [{ url: 'images/demo/hexen_atlas/samurai-v4.webp', note: 'Armour detail and landscape composition' }],
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

// Cross-tab guard (#34): a re-seed in one tab (after a version-bump deploy)
// writes tattoo_demo_seed_version, which fires a native `storage` event in
// every *other* open tab on the origin. A still-open sibling demo tab has the
// old dataset in memory; left running, any edit there flushes with a later
// updatedAt and last-write-wins sync resurrects the removed/replaced demo
// artists. Reloading that tab is simpler and safer than trying to reconcile
// two demo datasets in place. Real (non-demo) tabs are never touched — this
// only ever fires for a session this seeder marked (see isDemoSession above).
export function watchForDemoReseed(
  bootVersion = DEMO_SEED_VERSION,
  { addListener = (...a) => window.addEventListener(...a), reload = () => window.location.reload() } = {}
) {
  const handler = (e) => {
    if (e.key !== 'tattoo_demo_seed_version' || !isDemoSession()) return
    const newVersion = Number(e.newValue)
    if (Number.isSafeInteger(newVersion) && newVersion > bootVersion) reload()
  }
  addListener('storage', handler)
  return handler
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
