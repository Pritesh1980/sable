# Tattoo — Project Context for Claude Code

## What We're Building

A personal Progressive Web App (PWA) called **Tattoo** — a visual-first artist discovery and prioritisation tool. The core purpose is to map tattoo themes and style preferences against a curated list of favourite artists, helping plan a tattoo journey.

This is a personal app for one user (Pritesh) + occasional sharing with his tattoo artist via a read-only link.

**Philosophy: Start simple, build over time. MVP first.**

---

## Design Direction

- **Aesthetic**: Dark, moody, editorial. Think ink on black. High contrast. Refined, not rough.
- **Feel**: Luxury tattoo studio meets editorial magazine. Not grungy. Sophisticated darkness.
- **Typography**: Distinctive display font (serif or gothic) paired with a refined body font. No Inter, no Arial, no generic sans.
- **Colours**: Near-black backgrounds, off-white/cream text, a single sharp accent (e.g. deep red, gold, or electric blue — choose what feels right)
- **Motion**: Subtle, intentional. Staggered reveals on load. Hover states that feel considered.
- **Layout**: Asymmetric where possible. Card-based for artists. Visual-first throughout.

---

## Tech Stack

- **Framework**: React (PWA-configured)
- **Styling**: Tailwind CSS
- **Hosting**: AWS S3 + CloudFront (static site deployment)
- **AI**: Claude API (claude-sonnet-4-20250514) for concept image generation and artist style matching
- **Storage**: localStorage to start — easy to migrate later
- **No backend required for MVP**

### PWA Requirements
- `manifest.json` with app name, icons, dark background colour
- Service worker for offline support
- iPhone home screen installable

---

## MVP Features (V1)

### 1. Artist Gallery
The heart of the app. Visual-first browsing of saved artists.

- Each artist card shows: name, Instagram handle (linked), style tags, personal priority tier, and a gallery of reference images (manually added URLs or uploaded screenshots)
- Two starting tiers: **Favourite** (17 artists) and **Also Like** (5 artists)
- Drag-to-rank within tiers to set personal priority
- Filter by style tag
- Tap/click to open full artist detail view
- Studios displayed separately but consistently

### 2. My Brief
A personal mood board / brief section.

- Capture tattoo themes and ideas (title, description, style tags, body placement, reference images)
- Each idea can be linked to one or more artists from the gallery
- No status tracking in V1

### 3. Convention Radar
- List of upcoming tattoo conventions
- Distance from **Milton Keynes** shown for each
- Cross-reference: which saved artists are attending each convention
- Manual data entry for V1

### 4. AI Concept Generator
- Text prompt input → generated concept image via Claude API
- Results saved to a personal gallery
- Simple, clean interface

---

## Artist Data (Pre-load this)

### Favourite Artists (Tier 1 — 17 artists)
All are Instagram handles unless otherwise noted.

| Handle | Notes |
|---|---|
| zoia.ink | |
| tolgatemirlenk.ink | |
| keremtattz | |
| yuki_zerkjad | |
| carl245tattoo | Known as Carlos Valera |
| oscarakermo | Known as Oscar Akermo |
| leoalbuquerque.tattoo | |
| leon_del_cabo | |
| berkbosveren | |
| gody_tattoo | |
| inkfluid.joy | |
| saadtattoo | |
| m3.inkd | |
| picciott_ink | |
| victorportugal | Known as Victor Portugal |
| patrick_shanty | |
| cagriesk | |

### Also Like (Tier 2 — 5 artists)

| Handle | Notes |
|---|---|
| milanboros_tatts | |
| tattoo_amir | |
| silas_balaio | |
| suenanki | |
| nate_lights | |

### Studios (4 — to be expanded)

| Name | Notes |
|---|---|
| No Regrets | |
| London Glitch | |
| Straight Line | To be confirmed |
| Fatfugu | To be confirmed |

---

## Style Tags (Use These Consistently)

- `dark-illustrative`
- `fine-line`
- `blackwork`
- `surrealism`
- `dark-fantasy`
- `realism`

Artist style tags to be assigned by user in-app — don't pre-assign without confirmation.

---

## User Context

- **User**: Pritesh, based in **Milton Keynes**
- **Device**: iPhone (primary), Mac (development)
- **AWS**: Active account, comfortable using S3 + CloudFront
- **Instagram**: Primary source for artist discovery
- **Tattoo themes**: To be added by user — leave My Brief empty for now

---

## V2 Features (Do Not Build Yet — For Reference)

- Mood boards (group ideas visually)
- Read-only shareable link for tattoo artist
- Artist ↔ idea matching / recommendation
- Status tracking (idea → booked → done)
- Convention artist attendance auto-lookup

---

## File Structure (Suggested)

```
tattoo-app/
├── public/
│   ├── manifest.json
│   ├── icons/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── ArtistCard.jsx
│   │   ├── ArtistDetail.jsx
│   │   ├── BriefIdea.jsx
│   │   ├── ConventionCard.jsx
│   │   └── ConceptGenerator.jsx
│   ├── data/
│   │   └── artists.js        ← pre-loaded artist list
│   ├── pages/
│   │   ├── Gallery.jsx
│   │   ├── Brief.jsx
│   │   ├── Conventions.jsx
│   │   └── Concepts.jsx
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── CLAUDE.md                  ← this file
├── package.json
└── vite.config.js
```

---

## How to Start

In Claude Code, run:

```bash
npm create vite@latest tattoo-app -- --template react
cd tattoo-app
npm install
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Then say: **"Build the MVP per CLAUDE.md"**
