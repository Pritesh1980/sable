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
too, and every AI-prefilled field remains a suggestion for the user to verify.

```mermaid
flowchart TB
  START(["Find an artist on Instagram"])
  CAPTURE{"What do you have?"}
  SHOT["Paste, drop, or choose<br/>a screenshot"]
  HANDLE["Paste handle or profile URL"]
  KEY{"Gemini key available?"}
  ANALYSE["Extract handle and name<br/>suggest tags and style note"]
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
  CAPTURE -- "screenshot" --> SHOT --> KEY
  CAPTURE -- "handle or URL" --> HANDLE --> VERIFY
  KEY -- yes --> ANALYSE --> VERIFY
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
device-local key, or a copy-and-paste round trip through an external AI tool.

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

The direct provider keys and composer draft remain on the device. Visual artist matching
also runs on-device; only an explicitly requested generation or screenshot-analysis call
goes to an external AI provider.

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

## 5. Work offline and recover safely

Every edit is local first. Sync is the normal cross-device path; a downloaded backup is
an extra restore point controlled by the user.

```mermaid
flowchart TB
  EDIT(["Create, edit, rank, or delete"])
  LOCAL["Update the screen and<br/>device cache immediately"]
  ONLINE{"Backend reachable?"}
  SYNC["Background sync confirms<br/>documents and image blobs"]
  DIRTY["Keep durable pending state<br/>continue working offline"]
  RETURN{"What happens next?"}
  RETRY["Reconnect or reopen Sable<br/>reconcile and retry"]
  DEVICE["Sign in on another device<br/>pull account data and image refs"]
  BACKUP["Settings → Export Backup<br/>download JSON with embedded images"]
  LOSS{"Need to recover or replace data?"}
  IMPORT["Settings → Import Backup"]
  REPLACE["Choose backup file<br/>current collections are replaced"]
  RESTORED["Continue from restored state"]

  EDIT --> LOCAL --> ONLINE
  ONLINE -- yes --> SYNC --> RETURN
  ONLINE -- no --> DIRTY --> RETURN
  RETURN -- "network returns" --> RETRY --> SYNC
  RETURN -- "move devices normally" --> DEVICE --> SYNC
  RETURN -- "create restore point" --> BACKUP --> LOSS
  LOSS -- yes --> IMPORT --> REPLACE --> RESTORED
  LOSS -- no --> RETURN
```

API keys, theme, font size, and the derived Taste Engine index are device-local and are
not restored by account sync. The index can be rebuilt from images; provider keys must
be entered separately on each device.
