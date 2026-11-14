---
ijfw_version: 1.3.2
ijfw_schema: 1
type: software
primary_type: software
secondary_types: []
confidence: 0.903
detected_at: 2026-11-14T21:01:58.905Z
signals:
  - kind: manifest
    weight: 0.9
    manifests: [package.json, package.json]
  - kind: dir_design
    weight: 0.4
    name: design
  - kind: dir_design
    weight: 0.4
    name: assets
  - kind: dir_design
    weight: 0.4
    name: designs
  - kind: dir_design
    weight: 0.4
    name: assets
  - kind: dir_design
    weight: 0.4
    name: designs
  - kind: file_extension_ratio
    weight: 0.7
    domain: software
    ratio: 0.93
    count: 584
  - kind: file_extension_ratio
    weight: 0.7
    domain: design
    ratio: 0.068
    count: 43
---
# Sable — Agent Context

**Canonical project context lives in [`CLAUDE.md`](CLAUDE.md). Read that file first.**

Everything an agent needs — what we're building, design direction, tech stack, features,
artist/studio data, testing approach, and project structure — is maintained there as the
single source of truth. This file deliberately does not duplicate it (the old copy drifted
out of date).

## Quick orientation

- **Looking for more work:** check the open GitHub issues labelled `backlog` (skip any
  also labelled `in-progress`) before proposing or starting new work; `BACKLOG.md` is
  only a local index of them.
- **User guide:** [`docs/`](docs/README.md), also available in-app under **More → Help**.
- **Keeping docs in sync:** when you change UI under `src/pages/` or `src/components/`,
  update the matching `docs/NN-*.md` and the `SECTIONS` array in `src/pages/Help.jsx`, then
  re-capture screenshots — see [`docs/MAINTAINING.md`](docs/MAINTAINING.md). A Stop hook
  (`scripts/docs-drift-check.sh`) reminds you if you forget.
- **Run it:** `npm install && npm run dev` (→ http://localhost:5173); `npm test`; `npm run build`.

<!-- IJFW-MEMORY-START -->
Project memory at .ijfw/memory/. Call `ijfw_memory_prelude` for full context.
<!-- IJFW-MEMORY-END -->

<!-- IJFW-AGENTS-START -->
No project agents yet. Run `ijfw team` to set them up.
<!-- IJFW-AGENTS-END -->
