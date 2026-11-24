# Sable — Agent Context

**Canonical project context lives in [`CLAUDE.md`](CLAUDE.md). Read that file first.**

Everything an agent needs — what we're building, design direction, tech stack, features,
artist/studio data, testing approach, and project structure — is maintained there as the
single source of truth. This file deliberately does not duplicate it (the old copy drifted
out of date).

## Quick orientation

- **Other agents work here too** (Claude Code, codex, antigravity), often at the same time,
  and coordinate only through git and GitHub. Before starting anything, run
  **`npm run agents:status`** (`-- --no-fetch` without network): claimed issues, open PRs,
  and every agent's worktree. The rules are in `CLAUDE.md` under
  **Working alongside other agents**. In short: your own worktree and a `codex/…` /
  `claude/…` / `agy/…` branch, a draft PR with `Fixes #N` as soon as there's a commit,
  handoffs as issue comments, stage files by name.
- **Looking for more work:** check the open GitHub issues labelled `backlog`, skipping any
  that `npm run agents:status` lists as claimed; `BACKLOG.md` is only a local index of them.
- **Odd tooling error** (npm, brew, node, Vite, codex's network)? `docs/TROUBLESHOOTING.md`.
- **User guide:** [`docs/`](docs/README.md), also available in-app under **More → Help**.
- **Keeping docs in sync:** when you change UI under `src/pages/` or `src/components/`,
  update the matching `docs/NN-*.md` and, if Help answers it, its topic in `src/data/helpTopics.js`, then
  re-capture screenshots — see [`docs/MAINTAINING.md`](docs/MAINTAINING.md). A Stop hook
  (`scripts/docs-drift-check.sh`) reminds you if you forget.
- **Run it:** `npm install && npm run dev` (→ http://localhost:5173); `npm test`; `npm run build`.
