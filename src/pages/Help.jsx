import { useState } from 'react'
import Logo from '../components/Logo'

// On-device quick guide. The full, screenshot-rich documentation lives in /docs.
// Screenshots are served from public/guide/ (same image set the docs reference).
const SECTIONS = [
  {
    id: 'getting-started',
    label: 'Getting started',
    blurb: 'The home dashboard, navigation, and the controls that are always within reach.',
    image: 'dashboard.png',
    steps: [
      'The bottom bar holds the five main areas: Home, Artists, Brief, Radar and AI. Tap More (⋯) for Studios, Boards, Manage and this Help page.',
      'Home is your dashboard — it surfaces active ideas, artists to contact next, idea→artist matches, and your top-ranked artists.',
      'Top-right: tap A+/A− to change text size and ◑/◐ to switch between dark and light themes.',
      'Your artists, studios and conventions come pre-loaded. Ideas, boards and concepts start empty — you build those.',
    ],
  },
  {
    id: 'managing-artists',
    label: 'Managing artists',
    blurb: 'Add artists, upload portfolio photos, and set tags, status, studio and notes.',
    image: 'manage-artist-expanded.png',
    steps: [
      'Go to More → Manage. Use Add New Artist to add an Instagram handle (display name optional).',
      'Tap a row to expand it. Set Style Tags, Shortlist Status, Studio, and free-text Notes (notes save on blur or Enter).',
      'Use + Photos to upload screenshots — they are compressed and stored locally on your device.',
      'Style tags drive the artist-matching you see in Brief and Concepts, so keep them accurate.',
    ],
  },
  {
    id: 'gallery-ranking',
    label: 'Gallery & ranking',
    blurb: 'Browse your collection four ways, filter by style, and rank your favourites.',
    image: 'gallery-grid.png',
    steps: [
      'Open Artists. Switch views with the toggle: ☰ Filmstrip, ⊟ Compare, ⊞ Grid, ▦ Style Wall.',
      'Tap a style tag in the filter bar to show only artists with that tag; tap All to clear it.',
      'In Grid view, drag a card to reorder rank. In Filmstrip, nudge the rank directly.',
      'Tap Rank to enter swipe-compare: pick the better of two artists repeatedly to build an order. Undo reverses your last choice.',
      'Tap any card to open the full artist detail — photos, tags, status, studio, notes and conventions they are attending.',
    ],
  },
  {
    id: 'brief-boards',
    label: 'Brief & boards',
    blurb: 'Capture tattoo ideas, link artists to them, and group ideas into mood boards.',
    image: 'brief-idea-editor.png',
    steps: [
      'Open Brief and tap + to create an idea. Add a title, description, style tags, body placement and reference images.',
      'As you add style tags, matching artists appear ranked by overlap, status and rank — tap to link them to the idea.',
      'Use Copy brief to put a shareable, formatted summary on your clipboard.',
      'In Boards (More → Boards), group related ideas into a themed board, reorder them, and copy a board-level brief.',
    ],
  },
  {
    id: 'conventions-studios',
    label: 'Conventions & studios',
    blurb: 'See upcoming conventions by distance and where your artists work.',
    image: 'conventions.png',
    steps: [
      'Radar lists conventions, nearest to Milton Keynes first, with dates, distance and a link to each event.',
      'Where an artist is attending a convention, you will see it on their detail card and on the dashboard.',
      'More → Studios groups your saved artists by the studio they work at, sorted by distance, with links to Instagram and the studio site.',
      'Assign an artist to a studio in Manage (or the artist detail) to make them appear under Studios.',
    ],
  },
  {
    id: 'concepts',
    label: 'AI concepts',
    blurb: 'Turn a description into a concept, then match it to artists by style.',
    image: 'concepts.png',
    steps: [
      'Open AI and describe a tattoo concept in the prompt box.',
      'Without an API key: tap Copy Prompt, paste it into ChatGPT, Claude or Gemini, then bring the result back via Paste image / Paste text.',
      'With an OpenAI key configured (⚙ Configure AI): press ⌘+Enter to generate a DALL·E image directly.',
      'Tag each concept with styles to reveal its top artist matches; tap a match to open their Instagram.',
    ],
  },
  {
    id: 'backup',
    label: 'Backup & restore',
    blurb: 'Your data lives on this device — export it to keep it safe or move it.',
    image: 'manage-backup.png',
    steps: [
      'In More → Manage, use Export Backup to download a JSON file containing artists, ideas, boards, concepts, notes, ranks, tags and saved images.',
      'Use Import Backup to restore from a previously exported file — this replaces the current data.',
      'Export before clearing your browser data, switching devices, or making big changes.',
    ],
  },
]

function Section({ section, open, onToggle }) {
  return (
    <div className="bg-ink-card border border-ink-border rounded-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-ink-muted transition-colors"
      >
        <div>
          <p className="font-display text-cream text-lg leading-tight">{section.label}</p>
          <p className="font-body text-cream-muted/70 text-xs mt-0.5">{section.blurb}</p>
        </div>
        <span className={`text-cream-muted/60 text-xs transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="px-5 pb-5 animate-slide-up">
          <ol className="space-y-2.5 mb-4">
            {section.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm font-body text-cream-muted leading-relaxed">
                <span className="font-mono text-accent/70 text-xs tabular-nums mt-0.5 shrink-0">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="rounded-sm overflow-hidden border border-ink-border bg-ink-muted">
            <img
              src={`/guide/${section.image}`}
              alt={`${section.label} screenshot`}
              loading="lazy"
              className="w-full block"
              onError={(e) => { e.currentTarget.parentElement.style.display = 'none' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default function Help() {
  const [open, setOpen] = useState(() => new Set(['getting-started']))

  function toggle(id) {
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-ink-black max-w-3xl mx-auto px-4 md:px-8 pt-safe-top pb-24">
      <div className="pt-12 pb-6">
        <Logo size={24} className="mb-2" />
        <h1 className="font-display text-3xl text-cream">How to use Tattoo</h1>
        <p className="font-body text-cream-muted/80 text-sm mt-2 leading-relaxed max-w-prose">
          A quick guide to every part of the app. Tap a section to expand it. The full
          illustrated documentation lives in the <span className="font-mono text-cream-muted">/docs</span> folder.
        </p>
      </div>

      <div className="space-y-3">
        {SECTIONS.map((section) => (
          <Section
            key={section.id}
            section={section}
            open={open.has(section.id)}
            onToggle={() => toggle(section.id)}
          />
        ))}
      </div>
    </div>
  )
}
