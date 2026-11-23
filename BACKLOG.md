# Backlog

The backlog lives in [GitHub Issues](https://github.com/Pritesh1980/sable/issues)
(label: `backlog`; deployment-blocked items also carry `deployment`; proposals waiting on
owner review carry `question`; items another agent is actively working on carry
`in-progress` — skip those). Agents looking for more work should inspect the open
`backlog` issues first:

```bash
gh issue list --repo Pritesh1980/sable --state open --label backlog
```

Active roadmap & open issues (as of 2026-11-23):

- **Roadmap umbrella:** [#177 Roadmap: new features, winter 2026 → summer 2027](https://github.com/Pritesh1980/sable/issues/177)
- **Owner UX catalogue (remaining group F):** [#220 Catalogue the owner's UX complaints and their causes before fixing anything](https://github.com/Pritesh1980/sable/issues/220)
- **Taste Engine (Phase 4, no key needed):**
  - [#186 Search your library by words, on-device (CLIP text encoder)](https://github.com/Pritesh1980/sable/issues/186)
  - [#187 Curation assistant: key-free style-tag suggestions and off-style photo flags](https://github.com/Pritesh1980/sable/issues/187)
- **Ideas, Library & Radar:**
  - [#208 Ideas: mark up reference photos without changing originals](https://github.com/Pritesh1980/sable/issues/208)
  - [#209 Radar: prepare an offline show pack with verified photo readiness](https://github.com/Pritesh1980/sable/issues/209)
  - [#210 Library: review byte-identical reference photos safely](https://github.com/Pritesh1980/sable/issues/210)
- **Bigger bets (Phase 5):**
  - [#189 Sable Copilot spike: ask one question across artists, ideas and shows](https://github.com/Pritesh1980/sable/issues/189)
  - [#190 Show planning for 2027: worth-the-trip score and floor-plan route](https://github.com/Pritesh1980/sable/issues/190)
- **Blender (Phase 6):**
  - [#193 Blender: repair and preview relief STLs before printing](https://github.com/Pritesh1980/sable/issues/193) (`question`)
  - [#194 Blender: render demo and guide imagery from fictional pieces](https://github.com/Pritesh1980/sable/issues/194) (`question`)
- **AWS / Deployment:**
  - [#5 AWS backend adapter (Cognito + API store + S3 blobs)](https://github.com/Pritesh1980/sable/issues/5)
  - [#6 Deploy to S3 + CloudFront](https://github.com/Pritesh1980/sable/issues/6) (`deployment`)

This list goes stale; the issue tracker is the source of truth.

Capture new items as issues (the GitHub mobile app works well for this); keep this
file as a pointer only.
