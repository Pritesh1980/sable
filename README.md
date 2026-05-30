# Tattoo

A personal, visual-first Progressive Web App for planning a tattoo journey — collecting
favourite artists, capturing ideas, matching the two together, and tracking conventions
and studios. Dark, editorial, offline-capable, and stored entirely on your device.

## User guide

Full, screenshot-rich documentation lives in **[`docs/`](docs/README.md)** — start there
for a tour of every workflow. The same guide is also available inside the app under
**More → Help**.

## Tech

- **React** + **React Router** (PWA-configured)
- **Tailwind CSS**
- **Vite** build tooling
- **localStorage** + **IndexedDB** for data and images (no backend)
- **Vitest** + Testing Library for tests

## Develop

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm test         # run the test suite
npm run build    # production build
```

See [`CLAUDE.md`](CLAUDE.md) for the full project context, design direction and conventions.
