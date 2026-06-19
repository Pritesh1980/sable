# Sable — Agent Context

**Canonical project context lives in [`CLAUDE.md`](CLAUDE.md). Read that file first.**

Everything an agent needs — what we're building, design direction, tech stack, features,
artist/studio data, testing approach, and project structure — is maintained there as the
single source of truth. This file deliberately does not duplicate it (the old copy drifted
out of date).

## Quick orientation

- **User guide:** [`docs/`](docs/README.md), also available in-app under **More → Help**.
- **Keeping docs in sync:** when you change UI under `src/pages/` or `src/components/`,
  update the matching `docs/NN-*.md` and the `SECTIONS` array in `src/pages/Help.jsx`, then
  re-capture screenshots — see [`docs/MAINTAINING.md`](docs/MAINTAINING.md). A Stop hook
  (`scripts/docs-drift-check.sh`) reminds you if you forget.
- **Run it:** `npm install && npm run dev` (→ http://localhost:5173); `npm test`; `npm run build`.
