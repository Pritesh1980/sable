# Sable — Typical user workflows

Sable is not a set of isolated catalogues. Artists, ideas, concepts, rankings, studios,
and conventions are different views of one planning journey: notice a visual direction,
work out who can execute it, and turn that direction into something useful when speaking
to an artist.

These diagrams show the usual paths through the current app. Optional branches are
labelled; actions such as contacting an artist or booking an appointment happen outside
Sable, then their outcome is recorded in the app.

For implementation boundaries, persistence, and deployment, see
[Sable — Architecture](ARCHITECTURE.md).

## The planning loop

```mermaid
flowchart LR
  INSPIRE["Instagram or other inspiration"]
  ARTISTS["Artists<br/>collect · inspect · rank"]
  IDEAS["Ideas<br/>describe · place · link"]
  CONCEPTS["AI Concepts<br/>generate · compare · refine"]
  PLAN["Pipeline, Radar, Studios<br/>prioritise · check context"]
  CONTACT["Artist conversation<br/>outside Sable"]
  OUTCOME["Booked or done<br/>recorded in Sable"]

  INSPIRE --> ARTISTS
  ARTISTS --> IDEAS
  ARTISTS --> CONCEPTS
  IDEAS --> CONCEPTS
  CONCEPTS --> ARTISTS
  ARTISTS --> PLAN
  IDEAS --> PLAN
  PLAN --> CONTACT --> OUTCOME
  OUTCOME -. "new learning changes the brief" .-> IDEAS
```

The loop is intentionally non-linear. You can begin with an artist whose work you love,
an idea you want to place, or a generated visual that helps identify the right artist.

---

## 1. Discover an artist and decide where they belong

The quickest path starts from an Instagram screenshot. A handle or profile URL works
too, and every AI-prefilled field remains a suggestion for the user to verify. A
convention is the other way in: its **artist index** and its **competition winners**
both land you on the same verify-and-add step.

```mermaid
flowchart TB
  START(["Find an artist on Instagram"])
  SHOW(["Or: spot one at a convention"])
  RADARIN{"Which list?"}
  LINEUP["Artist index<br/>the show's published line-up"]
  WINNERS["Competition winners<br/>grouped by award category"]
  CAPTURE{"What do you have?"}
  SHOT["Share to installed PWA,<br/>paste, drop, or choose screenshot"]
  HANDLE["Paste handle or profile URL"]
  KEY{"Gemini key available?"}
  ANALYSE["Extract handle and name<br/>suggest tags, style note and artwork crop"]
  CROP["Review cropped artwork<br/>or restore whole screenshot"]
  MANUAL["Enter details manually<br/>screenshot still attaches"]
  VERIFY["Verify handle, tags,<br/>note, and first image"]
  DUP{"Artist already saved?"}
  APPEND["Add new images to<br/>the existing artist"]
  ADD["Add artist"]
  WALL["See work on the Wall"]
  VIEW["Open full-screen<br/>browse their portfolio"]
  INDEX{"Style index built?"}
  SIMILAR["Review Similar ink<br/>and taste fit"]
  ORGANISE["Use Classic gallery<br/>filter, compare, or rank"]
  STATUS{"Decision"}
  ACTIVE["Researching → Shortlisted<br/>→ Contact next"]
  PARK["Maybe or Pass"]

  START --> CAPTURE
  SHOW --> RADARIN
  RADARIN -- "everyone attending" --> LINEUP --> VERIFY
  RADARIN -- "who the judges picked" --> WINNERS --> VERIFY
  CAPTURE -- "screenshot" --> SHOT --> KEY
  CAPTURE -- "handle or URL" --> HANDLE --> VERIFY
  KEY -- yes --> ANALYSE --> CROP --> VERIFY
  KEY -- no --> MANUAL --> VERIFY
  VERIFY --> DUP
  DUP -- yes --> APPEND --> WALL
  DUP -- no --> ADD --> WALL
  WALL --> VIEW --> INDEX
  INDEX -- yes --> SIMILAR --> ORGANISE
  INDEX -- no --> ORGANISE
  ORGANISE --> STATUS
  STATUS -- "keep progressing" --> ACTIVE
  STATUS -- "not for now" --> PARK
  ACTIVE -. "more research or new photos" .-> WALL
```

Ranking and status answer different questions. Rank is one global preference order;
status says what should happen next. Moving someone to **Contact next** does not change
their rank, and moving them to **Maybe** does not delete their research.

Adding from either convention list does both halves of the job at once: the artist
lands in the gallery as *researching*, and is flagged as attending that show. Winners
arrive with the award already in their notes, so the reason you saved them survives.

OS sharing requires an installed PWA with share-target support and an active service
worker. The iOS Shortcut instead opens the same intake route ready for a paste.
If an artwork crop is unavailable or restored to the original screenshot, any taste
score is labelled rough. Removing a staged screenshot discards its AI suggestions
without erasing fields you edited yourself.

---

## 2. Turn an idea into an artist-ready brief

Ideas turn loose inspiration into structured, shareable context. The same six style tags
used by artists drive the first pass of matching.

```mermaid
flowchart TB
  START(["Tattoo idea or reference image"])
  NEW["Ideas → add an idea"]
  IMAGE{"Reference image available?"}
  FILL["Upload image<br/>optionally fill with Gemini"]
  WRITE["Add title and description"]
  SHAPE["Choose placement, status,<br/>style tags, and reference notes"]
  MATCH["Sable scores artist matches<br/>tag overlap + status + rank"]
  LINK["Review rationale<br/>link suitable artists"]
  BOARD{"Part of a larger piece?"}
  GROUP["Add to a Board<br/>order related ideas"]
  READY{"Ready to discuss?"}
  COPY["Copy idea brief<br/>or complete board brief"]
  SHARE["Paste into an artist conversation<br/>outside Sable"]
  BOOKED["When arranged externally:<br/>mark idea Booked"]
  DONE["After completion:<br/>mark idea Done"]
  REFINE["Refine description, tags,<br/>references, or artist links"]

  START --> NEW --> IMAGE
  IMAGE -- yes --> FILL --> WRITE
  IMAGE -- no --> WRITE
  WRITE --> SHAPE --> MATCH --> LINK --> BOARD
  BOARD -- yes --> GROUP --> READY
  BOARD -- no --> READY
  READY -- yes --> COPY --> SHARE --> BOOKED --> DONE
  READY -- no --> REFINE --> SHAPE
```

**Copy brief** exports text; it does not send a message or expose a public link. Boards
group and order ideas without owning them, so deleting a board leaves its ideas intact.

---

## 3. Generate and refine an AI concept

Concept generation has two equally supported routes: direct paid API generation with a
key stored on the device, or a copy-and-paste round trip through an external AI tool.

```mermaid
flowchart TB
  ORIGIN{"Starting point"}
  ARTIST["Artist viewer → press G<br/>artist steering is preselected"]
  IDEA["Prompt packs → choose<br/>an existing Brief idea"]
  FREE["Concepts → New concept<br/>write free text"]
  COMPOSE["Set idea, placement,<br/>and optional artist steering"]
  PATH{"How should it be generated?"}
  DIRECT["Generate image in Sable<br/>OpenAI or Gemini key required"]
  COPY["Copy structured prompt<br/>or provider-specific prompt pack"]
  EXTERNAL["Run prompt in ChatGPT,<br/>Claude, Gemini, or Firefly"]
  PASTE["Drop or paste result<br/>back into the composer"]
  SAVE["Save concept on the Concepts wall"]
  OPEN["Open full-screen → press I"]
  VARIANTS["Add result variants<br/>image · text · notes · rating"]
  BEST["Mark the strongest variant Best"]
  MATCH{"Need an artist?"}
  TAGS["Tag-based matches<br/>shared styles"]
  VISUAL["Visual matches and taste fit<br/>if style index is built"]
  STL{"Need a physical study?"}
  EXPORT["Make relief STL<br/>adjust, preview image, download"]
  REFINE["Use the result to refine<br/>the idea or generate again"]

  ORIGIN -- "artist-led" --> ARTIST --> COMPOSE
  ORIGIN -- "idea-led" --> IDEA --> COMPOSE
  ORIGIN -- "free text" --> FREE --> COMPOSE
  COMPOSE --> PATH
  PATH -- "saved API key" --> DIRECT --> SAVE
  PATH -- "copy prompt" --> COPY --> EXTERNAL --> PASTE --> SAVE
  SAVE --> OPEN --> VARIANTS --> BEST --> MATCH
  MATCH -- "styles" --> TAGS --> STL
  MATCH -- "concept image" --> VISUAL --> STL
  MATCH -- no --> STL
  STL -- yes --> EXPORT --> REFINE
  STL -- no --> REFINE
  REFINE -. "another direction" .-> COMPOSE
```

Provider keys and the composer draft are stored only on the device, although a direct
request necessarily supplies its key to the selected provider. Visual artist matching
runs on-device. Generation, screenshot analysis, and **Ask Gemini** / suggestion
**Refresh** are the provider-bound paths; discovery sends aggregate style-tag counts, up
to eight saved style descriptors, and an exclusion list of known or dismissed handles,
but no saved images. The discovery and image-generation clients currently put the Gemini
key in the provider request URL; screenshot analysis sends it in a request header.

Relief export creates a printable heightmap-style STL. It is an optional downstream use
of an image result, not a new concept type.

---

## 4. Plan contact, travel, and appointments

Sable organises the decision and records its outcome; Instagram, email, convention
booking, and tattoo appointments remain external.

```mermaid
flowchart TB
  PIPE["Open Pipeline"]
  RESEARCH["Researching"]
  SHORT["Shortlisted"]
  NEXT["Contact next"]
  PARK{"Pause this artist?"}
  MAYBE["Maybe or Pass<br/>parked outside active stages"]
  CONTEXT{"Check practical context"}
  RADAR["Radar<br/>distance and saved attendance"]
  STUDIO["Studios<br/>location, distance, saved artists"]
  DETAIL["Artist detail<br/>portfolio, notes, conventions"]
  DECIDE{"Contact now?"}
  CONTACT["Message the artist externally<br/>with copied idea or board brief"]
  MARK["Mark artist Contacted"]
  APPOINT{"Appointment arranged?"}
  BOOKED["Mark related idea Booked"]
  DONE["After the tattoo:<br/>mark idea Done"]
  LOOP["Keep researching<br/>or reprioritise"]

  PIPE --> RESEARCH --> SHORT --> NEXT --> PARK
  PARK -- yes --> MAYBE
  PARK -- no --> CONTEXT
  CONTEXT --> RADAR --> DECIDE
  CONTEXT --> STUDIO --> DECIDE
  CONTEXT --> DETAIL --> DECIDE
  DECIDE -- yes --> CONTACT --> MARK --> APPOINT
  APPOINT -- yes --> BOOKED --> DONE
  APPOINT -- "not yet" --> LOOP
  DECIDE -- no --> LOOP
  LOOP -. "rank or status changes" .-> PIPE
```

Convention attendance is currently curated by the user. Marking an artist as attending
surfaces that context on Radar, artist detail, Pipeline, and idea matching; Sable does
not automatically scrape an event roster.

---

## 5. Research a convention and choose who to see

Radar's imported roster and Top picks help decide who is worth researching. Attendance
flags are saved decisions, not tickets or confirmed appointments.

```mermaid
flowchart TB
  RADAR["Radar → choose show → Artist index"]
  SOURCE{"Lineup available?"}
  SEED["Use shipped Big London 2026 list"]
  IMPORT["Update list → paste published text<br/>or use grabber on the show's page"]
  MERGE["Validate and merge entries<br/>new import overrides seeded details"]
  VIEW{"How to browse?"}
  ALL["All / In your gallery / New to you<br/>search names, handles and booth notes"]
  PICKS["Top picks<br/>Must see · Wildcards · Worth a look"]
  CHECK["Read the reasons; inspect Instagram<br/>unmatched curated picks stay visible"]
  SAVED{"Already in gallery?"}
  ADD["Add artist<br/>also marks them attending"]
  FLAG["Toggle attendance for saved artist"]
  KEEP["Gallery research and attendance<br/>follow normal account sync"]
  WIN["Competition winners → paste results"]
  REVIEW["Review award category, place<br/>and matched artist identity"]
  PHOTO["Optionally attach photos<br/>of the winning piece"]

  RADAR --> SOURCE
  SOURCE -- "shipped list" --> SEED --> VIEW
  SOURCE -- "missing or needs updating" --> IMPORT --> MERGE --> VIEW
  VIEW -- "full index" --> ALL --> CHECK
  VIEW -- "prioritised" --> PICKS --> CHECK
  CHECK --> SAVED
  SAVED -- no --> ADD --> KEEP
  SAVED -- yes --> FLAG --> KEEP
  RADAR --> WIN --> REVIEW --> PHOTO
  REVIEW -- "save this artist" --> SAVED
```

Top picks use your saved artists, rank/status, known studios and curated choices;
they do not run CLIP or infer styles for the whole roster. **Pass** artists are omitted
from picks, and wildcards are explicitly unjudged suggestions. This is a research
shortlist, not a mapped walking route.

Imports and winner photos stay on this device. Only artists you explicitly save and
attendance flags join synced collections. **Clear list** also suppresses the shipped
seed; a later import makes the list available again. Winner-name matches should be
checked, especially when the app reports a name-prefix match rather than a handle.

---

## 6. Work offline and recover safely

Every edit is local first. With a remote backend configured, sync is the normal
cross-device path for account collections; the default local/demo adapter stays on
one device. A downloaded backup is an extra document restore point.

```mermaid
flowchart TB
  EDIT(["Create, edit, rank, or delete"])
  LOCAL["Update the screen and<br/>device cache immediately"]
  KIND{"Synced account collection?"}
  ONLY["Device-only: lineup, winners,<br/>preferences or derived index<br/>no backend retry"]
  ONLINE{"Backend reachable?"}
  SYNC["Background sync confirms<br/>documents and image blobs"]
  DIRTY["Keep durable pending state<br/>continue working offline"]
  RETURN{"What happens next?"}
  RETRY["After reconnect, reopen Sable<br/>or make another edit to retry"]
  DEVICE["With remote backend configured:<br/>sign in elsewhere and pull account data"]
  BACKUP["Settings → Export Backup<br/>download a JSON document snapshot"]
  LOSS{"Need to recover or replace data?"}
  IMPORT["Settings → Import Backup"]
  REPLACE["Choose backup file<br/>current collections are replaced"]
  RESTORED["Continue from restored state"]

  EDIT --> LOCAL --> KIND
  KIND -- no --> ONLY
  KIND -- yes --> ONLINE
  ONLINE -- yes --> SYNC --> RETURN
  ONLINE -- no --> DIRTY --> RETURN
  RETURN -- "later reopen or edit" --> RETRY --> SYNC
  RETURN -- "move devices normally" --> DEVICE --> SYNC
  RETURN -- "create restore point" --> BACKUP --> LOSS
  LOSS -- yes --> IMPORT --> REPLACE --> RESTORED
  LOSS -- no --> RETURN
```

API keys, theme, font size, and the derived Taste Engine index are device-local and are
not restored by account sync. Neither are the composer draft, imported lineups,
winners boards or winner photos. The index can be rebuilt from images; provider keys
must be entered separately on each device.

For supported saved-image removals, **Undo** remains available after closing a viewer
or moving to another route. Consecutive removals from the same source can be restored
as a batch. This is a short, in-memory recovery window, not a backup or an undo history
that survives reloads.

There is no `online` event listener today: connectivity returning by itself does not
start a retry. Reopening Sable runs reconciliation, while another edit schedules a new
flush.

Backup export serialises the values currently in memory. Inline `data:` images remain
embedded, but backend-resolved or signed image URLs are not fetched and materialised
into the JSON; those URLs may expire. Treat export as a document restore point, not a
guaranteed standalone archive of every image byte. Account sync remains the normal path
for moving backend image blobs between devices when a remote adapter is configured.
Settings backup covers the five account collections, not the device-only convention
imports or winner photos. Sign-out clears winner-board references but currently leaves
the photo bytes in IndexedDB; it is not a complete photo-erasure operation.
