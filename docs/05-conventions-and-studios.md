# Conventions & studios

*See which tattoo conventions are worth the trip, and where your saved artists actually work.*

← [Back to contents](README.md)

---

## Convention Radar

**⋯ → Radar** lists notable UK tattoo conventions, **nearest to Milton Keynes first**. The
closest show is highlighted as a hero card at the top.

![Convention Radar](../public/guide/conventions.png)

Each card shows the venue, dates, distance from Milton Keynes, a short summary, and a link
to the event's site. Popular shows are marked with a ★.

**Mark who's going.** Each card has a *Your artists attending* line — tap **Edit** to toggle
which of your saved artists are appearing at that show. Those names then surface on the
artist's detail card, on the Pipeline page, and next to the artist in idea matches. (Automatic look-up is
on the backlog; for now you set this yourself.)

> Conventions recur annually — the dates shown are for the latest known edition, so follow
> the link for the next one.

### Artist index

A big show publishes hundreds of artists as one long alphabetical list. **Artist index** on
each convention card turns that list into something you can work from the sofa or the show
floor.

#### Top picks

The index opens on **Top picks** — a verdict, not a list. **Must see** is whichever of your
own gallery is at this show, each with a one-line reason ("#5 in your ranking", "Matches your
styles: realism, dark-fantasy"). **Worth a look** is a stablemate at a studio you already
follow — someone new, at the same studio as an artist you've saved — so a stand you'd
otherwise walk past gets a reason to stop. Style matching only ever fires for an artist
already in your gallery: the show's own list carries no style data, so nothing is guessed.
Switch to **All** for the plain, searchable A–Z list.

#### Big London 2026 is already there

The Big London Tattoo Show's published line-up ships with the app — **466 artists, with each
one's studio and booth number**. Open **Artist index** on that card and it's ready: search it,
filter to **In your gallery** to see who you already follow, or search a booth number to find
out who's on it.

Two things it does that a plain list can't:

- The header counts your own artists in the line-up, so you know at a glance how many of your
  shortlist will be in the room.
- Searching matches the studio and booth as well as the name, so `No Regrets` or `Booth 315`
  both work.

The show was still adding artists when this snapshot was taken, so treat it as a floor. A
later import merges into it rather than replacing it — see below.

#### Grab it automatically (recommended for other shows)

Show sites load their artist list *as you scroll*, so selecting it by hand means thumbing every
artist into view first. The **grabber** does that for you — a bookmarklet that scrolls the
page, reads every artist off it, and sends the list straight back to Sable.

One-time setup:

1. In the artist index, tap **Copy the grabber**.
2. In Safari, bookmark any page — then edit that bookmark, rename it *Grab line-up*, and
   replace its **address** with what you copied.

Then, for any show:

1. Open the show's artist list.
2. Tap the **Grab line-up** bookmark. It scrolls the whole list (a few seconds) and shows
   *Sable found N artists*.
3. Tap **Import N artists into Sable** — the list lands in that show's index, and Sable
   confirms what arrived.

On a Mac you can skip the bookmark and paste the grabber into the browser console on the
artist list page instead. The grabber only reads the page you run it on, and only ever hands
data to Sable itself.

#### Or paste it in

Tap **Artist index → the show's artist list**, select the names on the show's page and paste
them into the box, one artist per line. Handles are optional; these all parse:

```
Oscar Akermo @oscarakermo
@kubalizmus
Carlos Valera (@carl245tattoo) — No Regrets, Cardiff
https://instagram.com/zoia.ink
Martin Kubala
```

Index letters, nav links and blank lines are ignored, and duplicates collapse. Nothing is
sent anywhere — the list is parsed on the device.

**Then work it.** The card header shows *N artists · M in your gallery*. Inside you can:

- **Search** by name, handle or the studio/country detail.
- Filter to **In your gallery** (who you already follow is going) or **New to you**.
- **Add** an artist straight to your gallery — they land as *researching* and are flagged
  as attending that show in one tap. Style tags stay empty: the show's list says nothing
  about style, so you tag them yourself once you've looked at their work.
- Tap **Attending?** on an artist you already have to flag them for that show — the same
  flag the *Your artists attending* line sets.

A later import **merges** rather than replaces, so re-pasting an updated line-up keeps
everything you'd already worked through — and an imported entry wins over a shipped one, so a
moved booth gets corrected rather than duplicated. **Clear list** empties the index, including
a shipped line-up, and it stays cleared until you import again. Anything you import is stored
on this device only (it's re-importable in seconds); the artists you add from it sync as
normal.

### Competition winners

Every show runs competitions — Best of Show, Best Black & Grey, Best Large Colour — and
puts the results up on a board by the stage on the last afternoon. That board is the most
useful list the convention produces: a room of judges has just picked the ten or twenty
best pieces out of a line-up of five hundred, already sorted into the style brackets your
gallery is tagged by.

**Competition winners** sits under the artist index on every convention card, and works the
same way: paste it in, and Sable turns it into a board you can work.

**Paste the results.** Put the award category on its own line, then the placings under it:

```
Best of Show
1st - Oscar Akermo @oscarakermo

Best Black & Grey
1st - Zoia @zoia.ink
2nd - Martin Kubala @kubalizmus - Nordic Ink
```

It also reads the format shows publish themselves, which looks like this:

```
Saturday - Small Healed.
1st Place - Tia tattooed by Adam Blakey, New Mind, Huddersfield.
```

Note who is who: the first name is the **collector wearing the tattoo** and the artist is
the one after *tattooed by*. Sable files the **artist** as the winner and keeps the
collector as context, because the artist is who you're deciding about.

Sable understands the shorthand shows actually use — `1st`/`First`/`Winner`, `1st Place`,
medal emoji, `B&G` for Black & Grey, a category with or without the word *Best*, and a
day-prefixed heading like *Saturday - Small Healed* — plus the one-line form
`Best Colour | 1st | Name @handle` if that's how you have it. Shows invent their own
categories (*Asian Inspired*, *Ornamental*, *Best of Saturday*); those are kept as the show
wrote them. Categories it doesn't
recognise are kept as you typed them rather than dropped, so a one-off *Best Tribal* still
shows up. Anything that isn't a result — the "congratulations to everyone who entered"
paragraph, page headings — is left out.

**Then work it.** Winners are grouped by category, whole-show prizes first, and ordered
1st → 2nd → 3rd within each. On every row you can:

- See at a glance whether the winner is **already in your gallery** (their rank shows) or
  is **new to you** (an **Add** button, which files them as *researching* with the award in
  their notes and flags them as attending that show).
- Tap **Attending?** on someone you already have.
- Open their Instagram from the handle.

**Add the winning tattoo.** Tap *+ Add a photo of the winning tattoo* on any row and pick
the shots off your camera roll — the piece itself, the trophy, the stage photo. You can add
several per winner. They're compressed on the way in and shown on the row from then on. It's
the difference between a list of names and a record of *what actually won*.

Photos are held in IndexedDB rather than alongside the rest of the winners data, because a
handful of phone screenshots would otherwise fill the browser's small localStorage budget and
take the gallery's offline cache down with it. The winner record itself only stores a
reference.

A later import **merges**, so you can paste Saturday's Best of Day when it goes up and add
the rest after Sunday's judging without losing anything — including photos you've already
attached, which are the one part a re-import can't bring back. **Clear results** empties the
board.

Winners are stored **on this device only** and are cleared when you sign out, because the
photos are yours. The artists you add from the board sync as normal.

---

## Studios

**Studios** (⋯ → Studios) groups your saved artists by the studio they work at, **sorted
by distance**, so you can see which are realistically reachable and who you could see where.

![The Studios page](../public/guide/studios.png)

- Only studios that have at least one of *your* artists appear.
- Each card lists those artists as chips — **tap a chip to open their Instagram**.
- **Visit site** links to the studio's page where known.

An artist shows up here once you've set their **Studio** field — do that from
[Manage](02-managing-artists.md) or the artist's detail card.

---

## How it all cross-references

These two pages aren't islands — the connections surface throughout the app:

- When an artist is attending a convention, you'll see it on their **detail card** and on
  the **dashboard**, and inside the **idea editor**'s artist matches.
- A studio assignment in *Manage* is what places an artist on the *Studios* page.

---

Next: **[AI concepts →](06-concepts.md)**
