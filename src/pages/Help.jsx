import { useState } from 'react'
import Logo from '../components/Logo'

// On-device quick guide. The full, screenshot-rich documentation lives in /docs.
// Screenshots are served from public/guide/ (same image set the docs reference).
const SECTIONS = [
  {
    id: 'getting-started',
    label: 'Getting started',
    blurb: 'The Wall, the full-screen viewer, and how to move around.',
    image: 'wall.png',
    steps: [
      'Sign in with your email and password to open the app. Your artists, ideas, boards and concepts are tied to your account and follow you across devices — add something on your Mac and it appears on your iPhone.',
      'You open on the Wall: every photo from every artist in your collection, edge to edge. Hover a photo to see whose it is; a red dot means it was added in the last 14 days.',
      'Pinned just under the bar is your Top 5 — the five artists you’ve ranked highest. Nudge any of them up or down with ▲ / ▼, or tap Rank ⤢ to open the full ranking board.',
      'Click any photo and it fills the screen. Arrow keys drive it: ←/→ moves through this artist’s work, ↑/↓ jumps between artists, G generates a concept in this artist’s style, I opens their info & notes, Esc returns to the Wall.',
      'Leave the mouse still and the viewer’s controls fade away, leaving just the image; move it and they return. The @handle link opens the artist’s Instagram in a new tab.',
      'The bar at the top switches between Artists and Concepts, adds an artist, and opens the ⋯ Drawer — home of the Classic gallery, Ideas, Pipeline, Radar, Studios, Settings and this Help page.',
      'The old Home dashboard lives at Drawer → Pipeline, unchanged: Top 5 coverflow, shortlist pipeline, idea stats and matches. On the classic pages the familiar bottom bar is still there, with the A+/A− text size, ◑/◐ theme and ⏻ sign-out controls at its right end.',
      'Your artists, studios and conventions come pre-loaded. Ideas, boards and concepts start empty — you build those.',
    ],
  },
  {
    id: 'managing-artists',
    label: 'Managing artists',
    blurb: 'Add artists, upload portfolio photos, and set tags, status, studio and notes.',
    image: 'manage-artist-expanded.png',
    steps: [
      'Tap + Add artist on the Wall to onboard an artist in one step: paste their handle or Instagram URL, toggle style tags, and drop in a few screenshots if you have them. If the handle already exists, Sable offers to add the images to that artist instead.',
      'Grow a portfolio as you find things: drag an image file onto an artist’s photo on the Wall, or paste (⌘V) while viewing them full-screen. New photos wear a red dot for two weeks.',
      'The Consider shelf at the bottom of the Wall suggests artists matched to your styles. Open the profile to judge, then + Add (pre-filled) or Not for me. Find more like this asks AI for a fresh batch — unverified until you’ve looked. With a Gemini key saved, the ↻ Refresh control in the shelf header re-runs AI discovery in one tap, skipping artists you already have or dismissed.',
      'For bulk upkeep, open Drawer → Classic gallery and tap Manage (top right): a searchable table of every artist.',
      'Tap a row to expand it. Set Style Tags, Shortlist Status, Studio, and free-text Notes (notes save on blur or Enter).',
      'Use + Photos to upload screenshots — they are compressed, stored in your account, and synced to your other devices.',
      'Style tags drive the artist-matching you see in Ideas and AI concepts, so keep them accurate.',
      'Tap Manage again to flip back to the visual gallery views.',
    ],
  },
  {
    id: 'gallery-ranking',
    label: 'Gallery & ranking',
    blurb: 'Rank from the Home Top 5, browse four ways, and filter by style.',
    image: 'gallery-grid.png',
    steps: [
      'The quickest place to rank is the Home Wall: your Top 5 is pinned at the top. Nudge any of the five up or down with ▲ / ▼, or tap Rank ⤢ to open the full ranking board — Top 5 pinned, everyone else below, with ▲ / ▼ on every row, Drop ↓ to push an artist out of the Top 5, and ↑ To top 5 to pull one in. Esc returns to the Wall.',
      'Open Drawer → Classic gallery for structured browsing. Switch views with the toggle: ☰ Filmstrip, ⊟ Compare, ⊞ Grid, ▦ Style Wall.',
      'Tap a style tag in the filter bar to show only artists with that tag; tap All to clear it.',
      'The Classic gallery also ranks: drag a card in Grid view, or nudge the rank number in Filmstrip. Every method feeds the same single ranking.',
      'Tap Rank to enter swipe-compare: pick the better of two artists repeatedly to build an order. Undo reverses your last choice.',
      'Tap any card to open the full artist detail — photos, tags, status, studio, notes and conventions they are attending.',
      'In the artist detail, Similar ink shows the three closest artists by how their work actually looks. Tap Build style index once — a small vision model downloads and all matching then runs on your device; your images never leave the browser.',
      'Similar ink also shows a taste line: how well the artist fits the taste learned from your ranking and statuses, and where the model would place them on images alone.',
    ],
  },
  {
    id: 'brief-boards',
    label: 'Ideas & boards',
    blurb: 'Capture tattoo ideas, link artists to them, and group ideas into mood boards.',
    image: 'brief-idea-editor.png',
    steps: [
      'Open Ideas and tap + to create an idea. Add a title, description, style tags, body placement and reference images.',
      'As you add style tags, matching artists appear ranked by overlap, status and rank — tap to link them to the idea.',
      'Use Copy brief to put a shareable, formatted summary on your clipboard.',
      'Switch to the Boards tab on the same page to group related ideas into a themed board, reorder them, and copy a board-level brief.',
    ],
  },
  {
    id: 'conventions-studios',
    label: 'Conventions & studios',
    blurb: 'See upcoming conventions by distance and where your artists work.',
    image: 'conventions.png',
    steps: [
      'Drawer → Radar lists conventions, nearest to Milton Keynes first, with dates, distance and a link to each event.',
      'On each convention card, tap Edit under "Your artists attending" to toggle which of your saved artists are appearing there.',
      'Where an artist is attending a convention, you will see it on their detail card and on the Pipeline page.',
      'Drawer → Studios groups your saved artists by the studio they work at, sorted by distance, with links to Instagram and the studio site.',
      'Assign an artist to a studio in the Classic gallery’s Manage mode (or the artist detail) to make them appear under Studios.',
    ],
  },
  {
    id: 'concepts',
    label: 'AI concepts',
    blurb: 'Generate in an artist’s style, keep results on their own wall, and export relief STLs.',
    image: 'concepts.png',
    steps: [
      'Switch to Concepts from the bar — or press G while viewing an artist full-screen, and the composer opens already steered to them.',
      'The composer is one panel: the steer card (tap change to pick another artist), your idea, a placement, then Generate image or Copy prompt instead. Your draft is kept on this device, so hopping out to another AI tab never loses it.',
      'No API key? Copy prompt, run it in ChatGPT, Claude, Gemini or AI Studio (great with a Google AI Pro subscription), then drop or paste the result into the composer — it saves to the wall exactly like a generated image.',
      'To generate in-app, open AI setup in the composer and add a paid OpenAI or Gemini API key (~$0.04/image, billing required; stored only on this device).',
      '+ Prompt packs in the composer builds tailored prompts for ChatGPT, Firefly, Gemini and Claude from free text or a Brief idea; Save Pack keeps the set. Pack concepts without an image wait in the Drafts strip until you paste a result in.',
      'Click a saved concept and it fills the screen like the artists’ Wall. Press I for its prompt, response, style matching and AI results — save multiple outputs as variants, each with an image, text, notes and a rating; mark the strongest as Best.',
      'For results with images, use Make STL to export a printable relief-style heightmap file.',
      'Tag each concept with styles to reveal its top artist matches; tap a match to open their Instagram.',
      'With the style index built (Artists → Similar ink), the info panel also shows Visual matches — the concept image compared against each artist’s actual work, on-device, to rank who could execute it — plus a taste-fit score for how strongly the image matches your overall taste.',
    ],
  },
  {
    id: 'backup',
    label: 'Settings, backup & restore',
    blurb: 'Your data syncs to your account — export a copy any time to keep it safe or move it.',
    image: 'settings.png',
    steps: [
      'Your data is saved to your account and synced across your devices automatically; a local copy is also kept on each device so the app works offline.',
      'Drawer → Settings shows your account (with sign out) and the backup tools.',
      'Use Export Backup to download a JSON file containing artists, ideas, boards, concepts, notes, ranks, tags and saved images.',
      'Use Import Backup to restore from a previously exported file — this replaces the current data.',
      'Export before making big changes if you want a restore point you control.',
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
        <h1 className="font-display text-3xl text-cream">How to use Sable</h1>
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
