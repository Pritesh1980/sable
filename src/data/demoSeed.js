// Demo seed — a fully fictional dataset so a fresh clone (or a public demo
// visit) sees the Wall, Top-5 dock and gallery looking alive instead of
// monogram placeholders. The curated real-artist images are third-party work
// and gitignored; these artists are invented and their artwork is generated
// SVG committed under public/images/demo/ (see scripts/generate-demo-art.js).
//
// Entry point: visit any route with `?demo=1` on the local backend
// (VITE_BACKEND=local, the default). Seeding writes the same localStorage keys
// the app's local-first storage reads — the offline cache (`tattoo_*`) AND the
// local backend's simulated remote store (`tattoo_remote_*`) — plus a local
// demo session, so sync reconciles to exactly this dataset. It never runs over
// an existing session and never touches non-local backends.

import { backend } from '../backend'
import { nowStamp } from '../backend/sync'

export const DEMO_SESSION = {
  user: { id: 'local-demo@example.com', email: 'demo@example.com' },
}

// BASE_URL is '/' locally and '/sable/' on GitHub Pages — prefix demo asset
// paths so the seeded artwork resolves under a sub-path deploy (otherwise every
// image 404s and the demo shows monograms).
const B = import.meta.env.BASE_URL
const demoImages = (id, count = 5) =>
  Array.from({ length: count }, (_, i) => `${B}images/demo/${id}/${i + 1}.svg`)

// Fictional artists only — invented names and handles, no resemblance to the
// real artists in src/data/artists.js. Tags come from the canonical STYLE_TAGS.
export const DEMO_ARTISTS = [
  { id: 'mora.blackfern', handle: 'mora.blackfern', name: 'Mora Vane', tags: ['dark-illustrative', 'fine-line'], styleNote: 'Botanical fine-line — branching stems and seed heads drawn in airy off-white line over deep black.', images: demoImages('mora.blackfern'), rank: 1, status: 'shortlisted', notes: '', studio: null },
  { id: 'vesper_noctis', handle: 'vesper_noctis', name: 'Vesper Ash', tags: ['dark-fantasy', 'surrealism'], styleNote: 'Nocturnal surrealism — eclipsed moons, drifting wisps and star fields in moody black-and-grey.', images: demoImages('vesper_noctis'), rank: 2, status: 'contact-next', notes: '', studio: null },
  { id: 'hexen_atlas', handle: 'hexen_atlas', name: '', tags: ['blackwork', 'surrealism'], styleNote: 'Sacred geometry — concentric circles, polygons and radial spokes with a single red mark.', images: demoImages('hexen_atlas'), rank: 3, status: 'shortlisted', notes: '', studio: null },
  { id: 'ferrum_line', handle: 'ferrum_line', name: '', tags: ['blackwork'], styleNote: 'Bold brush blackwork — thick gestural swipes with dry-brush texture and heavy saturation.', images: demoImages('ferrum_line'), rank: 4, status: 'researching', notes: '', studio: null },
  { id: 'quietruin.ink', handle: 'quietruin.ink', name: 'Juno Marek', tags: ['dark-illustrative', 'fine-line'], styleNote: 'Architectural sketch — fractured facades and fine hatching, drawn-on-skin immediacy.', images: demoImages('quietruin.ink'), rank: 5, status: 'contacted', notes: '', studio: null },
  { id: 'ashgrove.tattoo', handle: 'ashgrove.tattoo', name: '', tags: ['realism', 'dark-illustrative'], styleNote: 'Soft-shaded figurative abstraction — layered smoke-like forms with a red thread through each piece.', images: demoImages('ashgrove.tattoo'), rank: 6, status: 'researching', notes: '', studio: null },
  { id: 'palefox.ink', handle: 'palefox.ink', name: 'Sable Wren', tags: ['fine-line', 'realism'], styleNote: 'Delicate contour bundles — flowing parallel lines that read like wind over skin.', images: demoImages('palefox.ink'), rank: 7, status: 'maybe', notes: '', studio: null },
]

export const DEMO_IDEAS = [
  {
    id: 'demo-idea-forest',
    title: 'Night forest half-sleeve',
    description: 'Branching botanicals fading into a dark, starlit canopy. Fine line up top, denser black toward the elbow.',
    tags: ['dark-illustrative', 'fine-line'],
    placement: 'forearm',
    images: [{ url: `${B}images/demo/mora.blackfern/2.svg`, note: 'Line density reference' }],
    linkedArtists: ['mora.blackfern', 'palefox.ink'],
    status: 'idea',
  },
  {
    id: 'demo-idea-eclipse',
    title: 'Eclipse over still water',
    description: 'A near-total eclipse with thin drifting cloud lines below — quiet, heavy, mostly negative space.',
    tags: ['dark-fantasy', 'surrealism'],
    placement: 'upper arm',
    images: [{ url: `${B}images/demo/vesper_noctis/1.svg`, note: 'Mood reference' }],
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
}

// Boot-time hook (called from main.jsx before render). Seeds only when:
// `?demo=1` is present, the backend is the offline local adapter, and there is
// no existing session (a signed-in user — including a previous demo visit,
// whose edits we keep — is never overwritten). Returns true if it seeded.
export function maybeSeedDemo(location = window.location, backendKind = backend.kind) {
  if (backendKind !== 'local') return false
  if (new URLSearchParams(location.search || '').get('demo') !== '1') return false
  try {
    if (localStorage.getItem('tattoo_local_session')) return false
    seedDemoData(localStorage)
    return true
  } catch {
    return false
  }
}
