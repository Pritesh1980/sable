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
      'The public demo contains six invented artists with AI-generated tattoo imagery. Its label stays visible on the Wall, gallery, viewer, ranking and image-bearing editors after you dismiss the introduction. Demo updates reset sample artists and ideas, including your edits; real accounts are untouched. Lettering examples are concepts, not language-verified tattoo stencils.',
      'Sign in with your email and password to open the app. Your artists, ideas, boards and concepts are tied to your account and follow you across devices — add something on your Mac and it appears on your iPhone.',
      'You open on the Wall: every photo from every artist in your collection, edge to edge. The artist’s name sits along the bottom of each tile on touch, and fades in on hover with a mouse; a red dot means it was added in the last 14 days.',
      'Pinned just under the bar is your Top 5 — the five artists you’ve ranked highest. Drag the rank number on any tile to reorder the five, or tap Rank ⤢ to open the full ranking board.',
      'Click any photo and it fills the screen. Arrow keys drive it: ←/→ moves through this artist’s work, ↑/↓ jumps between artists, G generates a concept in this artist’s style, I opens their info & notes, Esc returns to the Wall. On a phone, swipe instead: left/right for this artist’s photos, up for the next artist, down to close. Tap the photo (or Details) for the panel with Previous/Next artist, Generate and Info & notes. Pinch to zoom still works.',
      'Leave the mouse still and the viewer’s controls fade away, leaving just the image; move it or press a key and they return. The @handle link opens the artist’s Instagram in a new tab.',
      'With a keyboard, Esc also closes whatever else is on top — the add-artist sheet, the More menu, a full-screen photo on an artist’s page, the status picker — one layer per press. Artist cards, thumbnails, Style Wall tiles and ideas open with Tab then Enter.',
      'The bar at the top switches between Artists and Concepts, adds an artist, and opens the ⋯ Drawer — home of the Classic gallery, Ideas, Pipeline, Radar, Studios, Settings and this Help page.',
      'The old Home dashboard lives at Drawer → Pipeline, unchanged: Top 5 coverflow, shortlist pipeline, idea stats and matches. On the classic pages the familiar bottom bar is still there, with the A+/A− text size, ◑/◐ theme and ⏻ sign-out controls at its right end. Tap the Sable logo at the top-left of any classic page to return to the Home Wall.',
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
      'Both add forms can auto-fill from an Instagram screenshot: with a Gemini key set (Concepts → AI setup), dropping, pasting or choosing a screenshot reads the handle, suggests tags from the artwork and drafts a style note — and if the style index is built, scores it against your taste before you add. The screenshot is cropped to the tattoo itself on your device, so Instagram chrome stays out of your collection and out of the score — the form says when it cropped and lets you keep the whole screenshot instead. Without a key it attaches uncropped and the score is marked rough.',
      'Share a screenshot straight in: with Sable installed to your home screen, Share → Sable from Instagram drops it into the add-artist form (Android and desktop Chrome). iPhone needs a one-off Shortcut — Safari doesn’t let web apps register as share destinations — check Settings for a one-tap install link, or set one up by hand: Copy to Clipboard then Open URL /share, after which you paste into the form that opens. Full recipe in the Managing artists guide.',
      'Grow a portfolio as you find things: drag an image file onto an artist’s photo on the Wall, or paste (⌘V) while viewing them full-screen. New photos wear a red dot for two weeks. Removing a photo shows an Undo bar for a few seconds rather than asking you to confirm.',
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
      'Demo portfolios span botanical, surrealist, Japanese-inspired, tribal, colour-realism and brush-lettering styles. The AI-generated imagery label follows the sample artwork into Browse and Rank, independently of editable notes.',
      'The quickest place to rank is the Home Wall: your Top 5 is pinned at the top. Drag the rank number on any tile to reorder the five, or tap Rank ⤢ to open the full ranking board — Top 5 pinned, everyone else below, with ▲ / ▼ on every row, Drop ↓ to push an artist out of the Top 5, and ↑ To top 5 to pull one in. Esc returns to the Wall.',
      'Open Drawer → Classic gallery for structured browsing. Switch views with the toggle: ☰ Filmstrip, ⊟ Compare, ⊞ Grid, ▦ Style Wall.',
      'Tap a style tag in the filter bar to show only artists with that tag; tap All to clear it.',
      'The Classic gallery also ranks: in Grid view turn on ⇅ Reorder to get drag handles (and a + for photos) on each card, or nudge the rank number in Filmstrip. With Reorder off, a grid card is one big tap target that just opens the artist. Every method feeds the same single ranking.',
      'Tap Rank to enter swipe-compare: judge artists one at a time as Pass / Maybe / Top, with a scrollable row of their reference images to browse first. Undo reverses your last choice.',
      'Tap any card to open the full artist detail — photos, tags, status, studio, notes and conventions they are attending.',
      'In the artist detail, Similar ink shows the three closest artists by how their work actually looks. Tap Build style index once — a small vision model downloads and all matching then runs on your device; your images never leave the browser.',
      'Similar ink also shows a taste line: how well the artist fits the taste learned from your ranking and statuses, and where the model would place them on images alone.',
      'Map (in the Artists header) lays out your whole collection by how the work looks — similar ink sits together, ringed by main style — with ✦ You marking your taste. Tap an artist to open them. It uses the same on-device style index.',
    ],
  },
  {
    id: 'brief-boards',
    label: 'Ideas & boards',
    blurb: 'Capture tattoo ideas, link artists to them, and group ideas into mood boards.',
    image: 'brief-idea-editor.png',
    steps: [
      'Open Ideas and tap + to create an idea. Add a title, description, style tags, body placement and reference images. 3D print on a reference image turns it into a printable relief STL.',
      'An AI-generated imagery label stays visible in an idea or board editor when it shows a shipped demo image; a Board cover is labeled even if its linked ideas have no demo images.',
      'With a Gemini key set and a reference image uploaded, Fill idea from image drafts the title, description, tags and placement from the image — only fields you left empty are filled.',
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
      'Artist index turns a show’s published line-up into something searchable, and the card tells you how many of them are already in your gallery. Big London 2026 ships with the app — 466 artists with their studio and booth number, so you can search a booth or filter to the artists you already follow.',
      'The index opens on Top picks: Must see is whichever of your own gallery is at the show, each with a reason (your ranking, matching styles); Worth a look is someone new at a studio you already follow. Switch to All for the plain searchable list.',
      'Show sites load their artist list as you scroll, so tap Copy the grabber and save it as a Safari bookmark once. Then tap that bookmark on the show’s artist list: it scrolls the whole thing for you and sends the artists back into Sable. Pasting the list in by hand still works too.',
      'From the index you can search the line-up, filter to the artists you already follow, add a new one to your gallery in a tap, and flag who you want to find on the floor. A later paste merges into the list rather than replacing it.',
      'Competition winners does the same for a show’s results board. Paste the categories and placings in — award category on its own line, then "1st - Name @handle" under it — and Sable groups them by category, whole-show prizes first, telling you which winners are already in your gallery.',
      'It reads the format shows publish ("1st Place - Tia tattooed by Adam Blakey, New Mind") as well as a plain "1st - Name @handle" — and in the published form the first name is the collector wearing the tattoo, so Sable credits the artist after "tattooed by" and keeps the collector as context.',
      'Tap + Add a photo of the winning tattoo on any winner to attach the shots you took — the piece, the trophy, the stage. Several per winner is fine. They stay on this device and survive a re-import, so you can add Saturday’s results and the rest after Sunday’s judging without losing them.',
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
      'If a saved concept reuses shipped demo artwork, its AI-generated imagery label appears on the tile and stays visible in the viewer.',
      'The composer is one panel: the steer card (tap change to pick another artist), your idea, a placement, then Generate image or Copy prompt instead. Your draft is kept on this device, so hopping out to another AI tab never loses it.',
      'No API key? Copy prompt, run it in ChatGPT, Claude, Gemini or AI Studio (great with a Google AI Pro subscription), then drop or paste the result into the composer — it saves to the wall exactly like a generated image.',
      'To generate in-app, open AI setup in the composer and add a paid OpenAI or Gemini API key (~$0.04/image, billing required; stored only on this device).',
      '+ Prompt packs in the composer builds tailored prompts for ChatGPT, Firefly, Gemini and Claude from free text or a Brief idea; Save Pack keeps the set. Pack concepts without an image wait in the Drafts strip until you paste a result in.',
      'Click a saved concept and it fills the screen like the artists’ Wall; Esc or × Close (top-left) takes you back. On a phone, swipe left/right between concepts, down to close, and tap the image (or Details) for Delete and Variants. Deleting shows an Undo bar for a few seconds. Press I for its prompt, response, style matching and AI results — save multiple outputs as variants, each with an image, text, notes and a rating; mark the strongest as Best.',
      'On a result with an image, Try on skin opens Live camera (free and instant: drag, pinch and twist the design over your camera view, Real size calibrates against a bank card to show centimetres, Save snapshot keeps it) or, for a polished render, takes a photo of the placement and has Gemini draw the design onto it as a healed tattoo (needs a Gemini key; the photo is sent to Google). Save the result as a variant to keep it.',
      'For results with images, use Make STL to export a printable relief (also from an idea’s reference image via 3D print, or any photo via Use another image…). Choose Relief for shading-as-height or Line art for crisp raised lines (it starts at Fine detail and 1.5mm lines, with Raise dark lines ticked; Line mask shows exactly what will be raised while you tune the threshold), or Lithophane for a thin plate that shows the image when backlit; Add a border gives it a stiffening frame; check it in the rotatable 3D preview before downloading.',
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
    <div className="bg-ink-card border border-ink-border rounded-xs overflow-hidden">
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
          <div className="rounded-xs overflow-hidden border border-ink-border bg-ink-muted">
            <img
              src={`${import.meta.env.BASE_URL}guide/${section.image}`}
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
