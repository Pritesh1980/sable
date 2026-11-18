import { useState } from 'react'
import Logo from '../components/Logo'

// On-device quick guide. The full, screenshot-rich documentation lives in /docs.
// Screenshots are served from public/guide/ (same image set the docs reference).
const SECTIONS = [
  {
    id: 'getting-started',
    label: 'Getting started',
    blurb: 'Home, the Wall, the full-screen viewer, and how to move around.',
    image: 'home-mobile.png',
    steps: [
      'The public demo contains six invented artists with AI-generated tattoo imagery, starting with Vesper, Ashgrove, Hexen, Asha, Mora and Ferrum. Its label stays visible on the Wall, Artists, viewer, ranking and image-bearing editors after you dismiss the introduction. Demo updates reset sample artists and ideas, including your edits and extra demo artists; real accounts are untouched. Lettering examples are concepts, not language-verified tattoo stencils.',
      'Forgot your password? On a real-account build, tap Forgot password? under the sign-in form and send the reset link to your email; the confirmation reads the same whether or not the address has an account. The link signs you in and asks for a new password (at least 8 characters, entered twice) before the app opens; Cancel signs you out. The device-local demo has no passwords and no such link.',
      'Private builds use invite-only email/password login and open only for the configured owner. Other accounts see Access denied and can sign out; a missing owner configuration keeps the library closed. The public demo is offered only in offline builds.',
      'Login and storage are separate. With device-local storage, artists, ideas, boards and concepts stay in this browser even with a real account. Signing in on your iPhone does not copy your Mac’s library; only cloud-storage builds sync across devices.',
      'You open on Home: your top artists, up to three open ideas, up to four AI concepts, and a Next line with one suggested step (add your first artist, a nearby guest spot, write an idea, pick an artist for an idea, make a first concept). An empty section says what it is and has a button to make the first one. The demo adds a strip saying it is a demo.',
      'Starting from nothing: empty Ideas and AI concepts pages define an idea, a board and a concept and show a faded Example of a filled one (a picture only, never saved). Empty Pipeline shows three steps: add an artist, put them in order, write an idea. Add a sample artist (empty Home, Artists and Pipeline) saves one invented artist with AI-generated photos so you can try the wall and ranking; a note on Home and Artists marks it, and Remove sample takes it out in one tap.',
      'The Wall is the first view in Artists: every photo from every artist, edge to edge. The artist’s name sits on each tile, and the studio shows on hover with a mouse. A red dot means added in the last 14 days. Your Top 5 is pinned above it: drag the rank number to reorder, or tap Reorder top 5 for the full ranking board.',
      'Click any photo and it fills the screen. Arrow keys drive it: ←/→ moves through this artist’s work, ↑/↓ jumps between artists, G generates a concept in this artist’s style, I opens their info & notes, M opens More like this for the photo, D opens Describe tattoo, Esc returns to the Wall (with Info & notes open, the first Esc closes just the panel). On a phone, swipe instead: left/right for this artist’s photos, up for the next artist, down to close. The photo count reads “Photo 1 of 3”, and the plate shows “Artist 2 of 26”. Moving to a different artist ripples the photo in; moving between one artist’s photos is a plain fade. The bottom bar has ‹ and › buttons for the previous and next photo; tap the photo (or More) for the panel with Previous/Next artist, Generate and Info & notes. Pinch to zoom still works.',
      'Back closes the photo: the browser’s Back (Android’s back button, Safari’s back swipe) returns to the Wall, not the page before it, however many photos you swiped through. The address names the photo, so a link opens it. A home-screen app on iPhone has no back gesture; use × Close or swipe down.',
      'Leave the mouse still and the viewer’s controls fade away, leaving just the image; move it or press a key and they return. The @handle link opens the artist’s Instagram in a new tab.',
      'With a keyboard, Esc also closes whatever else is on top — the add-artist sheet, the More menu, a full-screen photo on an artist’s page, the status picker — one layer per press. Wall photos, concepts, artist cards, thumbnails and ideas open with Tab then Enter.',
      'Every page has the same navigation: a bar along the bottom on a phone, the same list along the top on a laptop. It holds Home, Artists, Ideas, AI and More. More has two groups: Plan (Pipeline, Radar, Studios) and App (Settings, Help).',
      'The old dashboard lives at More → Pipeline: Top 5 coverflow, shortlist pipeline, idea stats, Nearby soon guest spots and idea matches.',
      'Studios and conventions come pre-loaded. The public demo includes fictional artists; offline owner builds can include a curated starter list. Real-auth libraries do not seed artists from an email match. Ideas, boards and concepts are yours to build.',
    ],
  },
  {
    id: 'managing-artists',
    label: 'Managing artists',
    blurb: 'Add artists, upload portfolio photos, and set tags, status, studio and notes.',
    image: 'artist-capture.png',
    steps: [
      'Artists + Add opens the capture form. Choose files, drop screenshots or tap Paste; then enter an Instagram handle or profile link and Save. Post, reel and story links are rejected. Only the handle is required; Details starts collapsed and holds optional name, tags, status and style note. The default status is Researching.',
      'Attaching a photo never starts an AI request. With a Gemini key set (Concepts → AI setup), tap Auto-fill to send the first staged screenshot to Gemini; provider charges may apply. It suggests details without overwriting your edits and crops to the artwork. Use the whole screenshot restores the original. Without a key, manual capture still works; optional Taste fit scores the uncropped image and marks it rough when a local style index exists.',
      'For an existing handle, attach photos and tap Add images to … instead: existing details are preserved. Artist saved or the photo count confirms a local library update, not cloud sync. A new artist starts unranked at the end of the Wall, which scrolls down to their photos. Cancel, Escape, backdrop and Full manage view ask before discarding an edited capture. Errors retain photos for retry; drafts do not survive reload, sign-out or app termination.',
      'Installed Android and desktop Chrome accept shared image files. iPhone uses a Shortcut accepting Images, URLs and Text: Copy selected Shortcut Input to Clipboard, then Open the fixed deployment /share URL. Tap Paste after Sable opens, or choose a photo / long-press paste the profile link if clipboard access fails. Settings offers installation only with a configured iCloud link. Real-iPhone acceptance is pending: the Shortcut may open Safari with a separate session/library from the installed app. Full recipe in the Managing artists guide.',
      'Found a tattoo but not the artist? Attach the photo in Add an artist and tap Save without artist. It lands at the front of the Wall as No artist yet. Open it and tap Give this an artist to move it to someone on your list, or Remove photo (with Undo); the viewer then moves on to your next saved photo. A style filter hides these photos. They are included in backups.',
      'Grow a portfolio as you find things: drag an image file onto an artist’s photo on the Wall, or paste (⌘V) while viewing them full-screen. New photos wear a red dot for two weeks. Removing a photo shows an Undo bar for a few seconds rather than asking you to confirm.',
      'The Consider shelf, just below the Top 5 strip and above the photos, suggests artists matched to your styles. Open the profile to judge, then + Add (pre-filled) or Not for me. Find more like this asks AI for a fresh batch — unverified until you’ve looked. With a Gemini key saved, the ↻ Refresh control in the shelf header re-runs AI discovery in one tap, skipping artists you already have or dismissed.',
      'For bulk upkeep, open Artists and tap Tools → Manage (top right): a searchable table of every artist.',
      'Tap a row to expand it. Set Style Tags, Shortlist Status, Studio, and free-text Notes (notes save on blur or Enter).',
      'Use + Photos to upload screenshots. Images are compressed and kept in the selected storage: device-local builds stay on this browser; only cloud-storage builds sync to other devices.',
      'Style tags drive the artist-matching you see in Ideas and AI concepts, so keep them accurate.',
      'Tap Done managing to flip back to the visual gallery views.',
    ],
  },
  {
    id: 'gallery-ranking',
    label: 'Gallery & ranking',
    blurb: 'Rank from the Wall’s Top 5, browse four ways, and filter by style.',
    image: 'gallery-grid.png',
    steps: [
      'Demo portfolios span botanical, surrealist, Japanese-inspired, tribal, colour-realism and brush-lettering styles. The AI-generated imagery label follows the sample artwork into Browse and Rank, independently of editable notes.',
      'The quickest place to rank is the Wall: your Top 5 is pinned at the top. Drag the rank number on any tile to reorder the five, or tap Reorder top 5 to open the full ranking board — Top 5 pinned, everyone else below, with ▲ / ▼ on every row, Drop ↓ to push an artist out of the Top 5, and ↑ To top 5 to pull one in. Esc returns to the Wall.',
      'Open Artists for structured browsing. Switch views with the named buttons: Wall (the default), Strip, Compare, Grid. Strip gives each artist a thin title line over a row of large photos; Compare puts two artists side by side on a phone (up to four on a wider screen) as columns of photos. Rank, Browse, Map and Manage are in the Tools menu in the header. Grid uses two continuous columns on phones, with names and handles wrapping inside each card; wider screens retain the featured top-three row.',
      'Tap Filter and pick a style tag to show only artists with that tag, in every view including the Wall; the tag then shows as a chip: tap its name to pick another, or its × to clear it. With no artists saved yet, the page shows + Add artist instead, which opens the same capture form as + Add.',
      'Open a photo on the Wall and tap the heart (or press F) to favourite it. It works on any photo, including one with no artist. Tap Filter, then Favourites, to show only those photos; the chip reads Favourites, and its × clears it. Favourites sync and are included in backups.',
      'Open a photo on the Wall and tap More like this (or press M; in the bottom panel on a phone) to see the three artists whose work sits closest to that one photo, then the photos most like it, including photos with no artist. Tap an artist or a photo to open it. It uses the on-device style index: if it is not built yet, the panel says so and offers Build style index. Photos are compared on this device and never leave it.',
      'Tap Describe tattoo (or press D; in the bottom panel on a phone), then Describe, for a few sentences about the tattoo in the open photo and the style tags it fits. It uses Gemini with your own key from Settings, and that Describe tap is the only time the photo is sent. The description is kept on this device, so reopening it is instant; Describe again asks afresh. It never names the artist or the person, and it can be wrong.',
      'The Artists page also ranks: in Grid view turn on ⇅ Reorder to get drag handles (and a + for photos) on each card, or nudge the rank number in Filmstrip. With Reorder off, a grid card is one big tap target that just opens the artist. Every method feeds the same single ranking.',
      'Tap Tools → Rank to enter swipe-compare: judge artists one at a time as Pass / Maybe / Top, with a scrollable row of their reference images to browse first. Undo reverses your last choice.',
      'Tap any card to open the full artist detail — photos, tags, status, studio, notes and conventions they are attending. ← Back, or the browser’s Back (Android’s back button, Safari’s back swipe), closes it and leaves you on the gallery; the address names the artist, so a link opens their detail.',
      'Guest spots, on the artist detail, record a trip to another studio: + Add guest spot takes the city, studio, dates, an announcement link and notes, and shows the distance from Milton Keynes; London areas like Hackney count as London, and an unknown place says distance unknown (it never guesses) and won’t show in Nearby soon. With a Gemini key, From a screenshot then Read dates reads an Instagram announcement, including when books open; that tap is the only time the image is sent, the screenshot stays on screen, and each city it finds waits for you to Review and Save.',
      'Nearby soon, on the Pipeline page, lists guest spots by your saved artists in the next 90 days within 100 miles (change it with Within; this device remembers). The Artists heading shows the soonest as a small chip, with +N linking to Pipeline, and Home’s Next line can suggest it; tapping one opens the artist at their Guest spots. Artists marked pass are left out.',
      'In the artist detail, Similar ink shows the three closest artists by how their work actually looks. Tap Build style index once — a small vision model downloads and all matching then runs on your device; your images never leave the browser.',
      'Similar ink also shows a taste line: how well the artist fits the taste learned from your ranking and statuses, and where the model would place them on images alone.',
      'Map (under Tools in the Artists header) lays out your whole collection by how the work looks — similar ink sits together, ringed by main style — with ✦ You marking your taste. Tap an artist to open them. It uses the same on-device style index.',
    ],
  },
  {
    id: 'brief-boards',
    label: 'Ideas & boards',
    blurb: 'Capture tattoo ideas, link artists to them, and group ideas into mood boards.',
    image: 'brief-idea-editor.png',
    steps: [
      'Open Ideas and tap + to create an idea. Add a title, description, style tags, body placement and reference images. 3D print on a reference image turns it into a printable relief STL; On arm puts it on the 3D arm at its real size (the forearm for a forearm idea, otherwise the upper arm), and Add to references keeps that picture as another reference. It works best with a flat design such as a drawing or flash sheet; a photo of a tattoo already on skin goes on whole, background and all.',
      'The tabs at the top of Ideas filter by status: All, then Idea, Booked or Done once at least one idea has that status.',
      'An AI-generated imagery label stays visible in an idea or board editor when it shows a shipped demo image; a Board cover is labeled even if its linked ideas have no demo images.',
      'With a Gemini key set and a reference image uploaded, Fill idea from image drafts the title, description, tags and placement from the image — only fields you left empty are filled.',
      'As you add style tags, matching artists appear ranked by overlap, status and rank — tap to link them to the idea.',
      'Use the sharing row below Back and Save. Share as image exports a 1080×1350 brief card with up to four available reference photos, short captions and a count of any extra references. External web image links are skipped. The system share sheet opens when available; otherwise the editor says Download requested and you can check your downloads for the PNG. Copy brief puts a formatted text summary on your clipboard.',
      'Make cover and the arrows below a reference reorder the photos. Card 1–4 marks the actual export selection; excluded web links and unavailable photos stay in the idea. Checking card means preparation is still running.',
      'Bring a Concepts image straight into an idea with Use in idea. New idea opens a draft for review and Save; Add to existing idea appends one reference immediately and opens it. The idea keeps an independent image copy without changing its other notes or crops.',
      'Preview card shows the exact PNG. Horizontal, Vertical and Zoom adjust each selected reference’s export crop; Reset crop centres it again without changing the original. Share this card and quick Share as image use the same prepared bytes. Refresh preview retries unavailable photos; Refresh card retries an error. Close the preview, then Save the idea to keep its order and crops. Back without Save discards those draft changes.',
      'Switch to the Boards tab on the same page to group related ideas into a themed board, reorder them, and copy a board-level brief or share a 1080×1350 board summary card as an image.',
    ],
  },
  {
    id: 'conventions-studios',
    label: 'Conventions & studios',
    blurb: 'See upcoming conventions by distance and where your artists work.',
    image: 'conventions.png',
    steps: [
      'More → Radar lists conventions, nearest to Milton Keynes first, with dates, distance and a link to each event.',
      'Each card opens on the next edition of the show. Tap a year under the dates to switch: attendance, the artist index and the winners all belong to that year, and an earlier edition is kept as a record of who was there.',
      'For an upcoming edition with known days, tap Add to calendar to download an all-day .ics event with the venue, show link and the saved artists you marked as attending that year. TBC dates and past editions have no calendar button. The event warns when dates are unconfirmed, so check them with the show before travel.',
      'Dates a show hasn’t confirmed yet say so ("not yet confirmed by the show", or the usual month with TBC), so check the show’s site before booking travel. Once the latest edition is over, the card says "This edition has passed".',
      'On each convention card, tap Edit under "Your artists attending" to toggle which of your saved artists are appearing there.',
      'Where an artist is attending a convention, you will see it on their detail card and on the Pipeline page.',
      'Artist index turns a show’s published line-up into something searchable, and the card tells you how many of them are already in your gallery. Big London 2026 ships with the app (tap 2026 on its card) — 466 artists with their studio and booth number, so you can search a booth or filter to the artists you already follow.',
      'The index opens on All, the plain searchable list. Tap Top picks for a verdict instead: Must see is whichever of your own gallery is at the show, each with a reason (your ranking, matching styles); Worth a look is someone new at a studio you already follow.',
      'Big London also ships with a researched field guide. Its picks that are not in your gallery appear under From the field guide, never under Must see; its speculative suggestions are kept apart as Wildcards.',
      'Show sites load their artist list as you scroll, so tap Copy the grabber and save it as a Safari bookmark once. Then tap that bookmark on the show’s artist list: it scrolls the whole thing for you and sends the artists back into Sable. Pasting the list in by hand still works too.',
      'From the index you can search the line-up, filter to the artists you already follow, add a new one to your gallery in a tap (their notes say which show you spotted them at; a winner’s say which award), and flag who you want to find on the floor. A later paste merges into the list rather than replacing it.',
      'Competition winners does the same for a show’s results board. Paste the categories and placings in — award category on its own line, then "1st - Name @handle" under it — and Sable groups them by category, whole-show prizes first, telling you which winners are already in your gallery.',
      'It reads the format shows publish ("1st Place - Tia tattooed by Adam Blakey, New Mind") as well as a plain "1st - Name @handle" — and in the published form the first name is the collector wearing the tattoo, so Sable credits the artist after "tattooed by" and keeps the collector as context.',
      'Tap + Add a photo of the winning tattoo on any winner to attach the shots you took — the piece, the trophy, the stage. Several per winner is fine. They stay on this device and survive a re-import, so you can add Saturday’s results and the rest after Sunday’s judging without losing them.',
      'More → Studios groups your saved artists by the studio they work at, sorted by distance, with links to Instagram and the studio site. Each artist chip shows their name, with the handle beside it, when you have saved one; otherwise just the handle.',
      'Assign an artist to a studio in the Artists page’s Manage mode (or the artist detail) to make them appear under Studios.',
    ],
  },
  {
    id: 'concepts',
    label: 'AI concepts',
    blurb: 'Generate in an artist’s style, keep results on their own wall, and export relief STLs.',
    image: 'concepts.png',
    steps: [
      'Switch to Concepts from the bar — or press G while viewing an artist full-screen, and the composer opens already steered to them.',
      'Refine this opens an image-only drawer with Change, Keep, black ink or colour, the exact source and outgoing prompt. The original stays unchanged. If a source cannot be read, choose its PNG, JPEG or WebP file; external links are not silently fetched.',
      'Manual refinement is available in the demo and offline: Copy refinement prompt does not attach the image. Export source image, attach it separately in your chosen AI, then select the provider and Import variation. Its provenance is user-attributed, not relay-verified.',
      'An activated private-owner build can Generate one variation through the named OpenAI model and fixed profile: one paid image, explicit consent, only the selected image and visible prompt. Read the linked privacy policy and API data controls. A storage-risk acknowledgement may be required; manual actions remain usable.',
      'Check recovery above the wall finds interrupted refinements without automatically sending another paid request. Closing does not cancel a job. Unknown acceptance retains the exact input and request ID; a new request after expiry or an uncertain provider outcome needs explicit confirmation. Choose a destination if the original concept was deleted. The recovery bar and the Paid image backup box appear only when the private relay is set up, a request is pending or awaiting recovery, or your library holds paid results — the public demo shows neither.',
      'Saved refinements show Original and variation, stacked on a phone. A deleted parent says Source image unavailable; the child remains visible with Rating, Mark Best and Try on skin.',
      'If a saved concept reuses shipped demo artwork, its AI-generated imagery label appears on the tile and stays visible in the viewer.',
      'The composer is one panel: the steer card (tap change to pick another artist), your idea, a placement, then Generate image or Copy prompt instead. Your draft is kept on this device, so hopping out to another AI tab never loses it.',
      'No API key? Copy prompt copies the same image prompt Generate image sends (idea, steer style and placement). Run it in an image generator such as ChatGPT, Gemini or AI Studio (great with a Google AI Pro subscription), then drop or paste the image into the composer — it saves to the wall exactly like a generated image.',
      'To generate in-app, open AI setup in the composer (tapping Generate image with no key opens it and jumps to the key field) and add an OpenAI or Gemini API key (provider billing required; prices depend on the model; keys stored only on this device). These keys do not activate the private refinement relay.',
      '+ Prompt packs in the composer builds tailored prompts for ChatGPT, Firefly, Gemini and Claude from free text or a Brief idea; Save Pack keeps the set. Pack concepts without an image wait in the Drafts strip until you paste a result in.',
      'Click a saved concept and it fills the screen like the artists’ Wall; Esc or × Close (top-left) takes you back (with its details open, the first Esc closes just the panel). On a phone, swipe left/right between concepts, down to close, and tap the image (or More) for Delete and Variants. Deleting shows an Undo bar for a few seconds. Press I for its prompt, response, style matching and AI results — save multiple outputs as variants, each with an image, text, notes and a rating; mark the strongest as Best.',
      'On a result with an image, Try on skin opens Live camera (free and instant: drag, pinch and twist the design over your camera view, Real size calibrates against a bank card to show centimetres, Save snapshot keeps it) or, for a polished render, takes a photo of the placement and has Gemini draw the design onto it as a healed tattoo (needs a Gemini key; the photo is sent to Google). Save the result as a variant to keep it.',
      'On a result with an image, View on arm in 3D puts the design on a 3D upper arm or forearm at its real size (see On the arm in 3D below).',
      'For results with images, use Make STL to export a printable relief (also from an idea’s reference image via 3D print, or any photo via Use another image…). Working from a photo of a real tattoo? Tap Lift the tattoo (needs a Gemini key) to redraw the ink flat black-on-white without skin or limb curve, compare Lifted design vs Original photo, and Save as variant (or Add to references). Choose Relief, Line art (Fine detail, 1.5mm lines, Line mask), Lithophane, or Print this tattoo (2-colour silhouette): enforces a 0.45mm minimum stroke and gap, cuts the plate to a 3mm silhouette margin (check Cutout mask), and exports a two-object 3MF (face-down 0.6mm inlay on a 3mm plate, or Raised), Split STLs (select both in Cura and Merge Models), or a Single-extruder STL with Cura pause-at-height guidance — for personal keepsakes of your own ink only. Check the rotatable 3D preview before downloading.',
      'Back closes the concept: the browser’s Back (Android’s back button, Safari’s back swipe) returns to the Concepts wall, however many concepts you swiped through, and the address names the concept, so a link opens it. A Make STL, Try on skin, View on arm in 3D or Refine panel opened on top closes first, and the live camera before its panel.',
      'Tag each concept with styles to reveal its top artist matches; tap a match to open their Instagram.',
      'With the style index built (Artists → Similar ink), the info panel also shows Visual matches — the concept image compared against each artist’s actual work, on-device, to rank who could execute it — plus a taste-fit score for how strongly the image matches your overall taste.',
    ],
  },
  {
    id: 'concept-arm',
    label: 'On the arm in 3D',
    blurb: 'See a concept or reference photo at its real size on an upper arm or forearm, turn it, and keep the picture.',
    image: 'concept-arm.png',
    steps: [
      'On a result with an image, choose View on arm in 3D; on an idea, tap On arm on a reference photo. The design goes on a 3D arm at its real size, close up on the tattoo. Upper arm and Forearm at the top switch limbs, keeping the design’s width (an idea opens on the limb its placement names).',
      'Drag to turn the arm, pinch to resize (scroll on a desktop). The size shows in centimetres, wide × tall, and how far round the arm it goes; Width, Above the elbow (Above the wrist on the forearm) and Round the arm place it precisely. Round the arm starts from the outer upper arm or the inner forearm. Whole arm steps back to judge scale.',
      'The ink is shown healed: a soft, cool black, and colour faded a little. Very faint strokes in a design stay faint on the arm.',
      'Save as variant keeps the picture on the concept, framed on the tattoo, with its size in the title and notes; from an idea, Add to references keeps it as another reference. Free and on-device: nothing is sent anywhere, and both arms work offline once the app is installed. Each is a standard arm (outer upper arm, inner forearm), not your own measurements.',
    ],
  },
  {
    id: 'concept-ideas',
    label: 'Use a concept in an idea',
    blurb: 'Move from a chosen image to an editable Idea draft or an existing plan.',
    image: 'concept-idea-picker.png',
    steps: [
      'Choose Use in idea on the original viewer image, or expand an image-bearing result under Variants & STL export. Saved skin, camera and 3D-arm results work too; text-only results have no image action.',
      'New idea opens a draft with the prompt, selected result notes, styles and image. Review it and tap Save to keep it. Back without Save or reloading discards the draft; browser history does not recreate it.',
      'Add to existing idea lets you search titles, select a destination and edit the optional note. Add image to idea appends one reference immediately, keeps the other fields and crops, and opens the idea.',
      'The idea stores an independent image copy without recompression or an AI request. Deleting the concept does not break that reference. A cached image can be copied offline; otherwise reconnect and retry. Cancel, Escape or browser Back closes only the picker.',
    ],
  },
  {
    id: 'concept-refinement',
    label: 'Refine an image',
    blurb: 'Keep the source, describe a change, and save a separate variation.',
    image: 'concept-refinement.png',
    steps: [
      'Choose Refine this on an original or image-bearing result. Review the exact prepared source, Change, Keep, palette and outgoing prompt. If reading fails, choose a PNG, JPEG or WebP file explicitly.',
      'Manual paths remain available: Copy refinement prompt, Export source image, attach it separately in your AI, then select the provider and Import variation. The import is user-attributed, not relay-verified.',
      'A private activated relay names the provider and fixed image profile and requires consent for one paid image. Only the selected image and visible prompt are sent. Read the provider privacy and API data controls; acknowledge device-storage risk when required.',
      'Check recovery after interruption. Retrying uses the saved request image and prompt, not newer draft edits. A new paid request after expiry or an uncertain outcome requires explicit confirmation. Closing the drawer does not cancel a job.',
    ],
  },
  {
    id: 'concept-refinement-compare',
    label: 'Compare a saved variation',
    blurb: 'Compare source and child, rate the direction, and keep a portable copy.',
    image: 'concept-refinement-compare.png',
    steps: [
      'Original and variation are side by side on desktop and stacked on a phone. Rating, Mark Best and Try on skin act on the saved child. A deleted parent is labelled Source image unavailable without hiding the child.',
      'Relay copies remain recoverable for 24 hours until a checked local save is acknowledged. Export full library backup, confirm the download and keep it off this device. Test import in a fresh context; persistence and a local save are not off-device backups.',
    ],
  },
  {
    id: 'backup',
    label: 'Settings, backup & restore',
    blurb: 'Export a portable library snapshot; device-only storage is not cloud sync.',
    image: 'settings.png',
    steps: [
      'With device-local storage, your library stays on this device even with a real login. Signing out clears displayed caches; signing back in as the same owner restores this device’s library. Only cloud-storage builds sync across devices.',
      'More → Settings shows your account (with sign out) and the backup tools.',
      'More → Settings → Appearance has one switch: Text size (Normal / Large). It is per-device and doesn’t sync. Sable is dark only.',
      'Use Export Backup to request a JSON download with artists, ideas, boards, concepts, notes, ranks, tags and local saved image bytes. Check that the file was actually saved. External portfolio and bundled image links remain references.',
      'Use Import Backup to restore from a previously exported file — this replaces the current data. If your library already holds anything, Sable first asks to confirm, naming what you have and what the backup holds (with its date). Cancel and nothing changes; there is no undo after you agree, so export first if you might want the current library back.',
      'Private full-library backups stop if a required local photo cannot be read. Ordinary offline Settings exports report missing photos; reconnect and export again. A requested download does not prove the file was saved.',
      'An image kept on this device can be backed up before its upload succeeds. Refinement can also prepare that device copy offline; imported variations are stored before they join the library.',
      'The refinement drawer offers the same Export full library backup action. Back up after Variation saved; pending jobs are not saved library results. Confirm the download and keep a copy off this device.',
      'Concepts shows when a download was requested and how many paid results were saved since that request. It does not verify an off-device copy; export again after new paid results, and keep the file somewhere safe.',
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
