# Tattoo

Tattoo is a local-first Progressive Web App for planning a personal tattoo journey. It keeps a curated artist collection, ranks favourites, links artists to tattoo ideas, groups ideas into mood boards, generates AI concept prompts/results, exports relief STL files from concept images, and tracks useful studio and convention context.

The app is built for Pritesh's own workflow. It runs locally today, with S3 + CloudFront deployment intentionally left for later.

## User Guide

Full workflow documentation lives in [`docs/`](docs/README.md), including artist management, ranking, briefs, boards, conventions, concepts, backups, and settings.

## What It Includes

- **Dashboard**: planning summary, active ideas, export-ready briefs, artists to contact, and top ranked artists.
- **Artists**: ranked artist gallery with filmstrip, grid, compare, style wall, browse, and swipe-ranking modes.
- **Brief**: tattoo ideas with descriptions, placements, style tags, reference images, linked artists, and copyable artist-ready briefs.
- **Mood Boards**: grouped ideas that can be ordered and copied as a board brief.
- **Convention Radar**: curated UK convention shortlist with distances from Milton Keynes and artist attendance override support.
- **Studios**: artist grouping by studio and reachability.
- **AI Concepts**: multi-provider prompt packs (ChatGPT, Adobe Firefly, Gemini, Claude) built from free text or a Brief idea, paste-back of AI results as rated variants with a "Best" pick, optional in-app image generation via an OpenAI (DALL·E 3) or Gemini key with artist-style steering, relief STL export from image results, and style-based artist matching on each concept.
- **Manage**: artist CRUD, tags, statuses, studios, notes, image import, and backup/import.

## Tech Stack

- React 19
- Vite
- Tailwind CSS
- React Router
- Vitest + Testing Library
- `localStorage` for metadata and app state
- IndexedDB for artist image storage

## Getting Started

```bash
npm install
npm run dev
```

The development server is usually available at `http://localhost:5173`.

## Useful Commands

```bash
npm test          # run the Vitest suite once
npm run test:watch
npm run lint
npm run build
npm run preview
```

## Data And Storage

Seed data lives in `src/data/`, with the artist list in `src/data/artists.js`.

Runtime edits are stored locally in the browser:

- `localStorage`: artist metadata, ideas, boards, concepts, theme, font size, convention overrides
- IndexedDB: artist image arrays

Use **Manage → Export Backup** before clearing browser data, changing machines, or doing larger data edits. The backup includes artists, ideas, boards, concepts, notes, ranks, tags, convention overrides, and saved image data.

## PWA Notes

The app includes `public/manifest.json`, app icons in `public/icons/`, and a basic service worker at `public/sw.js`.

Static deployment has not been configured yet. Before hosting on S3 + CloudFront, make sure deep-link routing is handled, otherwise refreshing routes such as `/gallery` may return a static-host 404.

## Development Notes

Follow the project convention in `AGENTS.md`: use TDD for new behavior, keep changes local-first unless deployment infrastructure exists, and do not build public sharing features until hosting is ready.
