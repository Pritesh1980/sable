# Backlog

The backlog lives in [GitHub Issues](https://github.com/Pritesh1980/sable/issues)
(label: `backlog`; deployment-blocked items also carry `deployment`; proposals waiting on
owner review carry `question`; items another agent is actively working on carry
`in-progress` — skip those). Agents looking for more work should inspect the open
`backlog` issues first:

```bash
gh issue list --repo Pritesh1980/sable --state open --label backlog
```

Active roadmap & open issues (as of 2026-11-10):

- **Roadmap umbrella:** [#177 Roadmap: new features, winter 2026 → summer 2027](https://github.com/Pritesh1980/sable/issues/177)
- **Brief & Concepts workflow bridges:**
  - [#204 Concepts → Brief: create an idea or attach a variant straight from AI Concepts](https://github.com/Pritesh1980/sable/issues/204)
  - [#205 Brief: reorder or pin reference photos so the chosen 4 appear on the DM brief card](https://github.com/Pritesh1980/sable/issues/205)
  - [#207 Boards: copy a board brief or share a board as a summary card image](https://github.com/Pritesh1980/sable/issues/207)
- **Taste Engine (Phase 4, no key needed):**
  - [#186 Search your library by words, on-device (CLIP text encoder)](https://github.com/Pritesh1980/sable/issues/186)
  - [#187 Curation assistant: key-free style-tag suggestions and off-style photo flags](https://github.com/Pritesh1980/sable/issues/187)
  - [#188 Taste over time: record rank and status history, show how the shortlist moved](https://github.com/Pritesh1980/sable/issues/188)
- **Bigger bets (Phase 5):**
  - [#189 Sable Copilot spike: ask one question across artists, ideas and shows](https://github.com/Pritesh1980/sable/issues/189)
  - [#190 Show planning for 2027: worth-the-trip score and floor-plan route](https://github.com/Pritesh1980/sable/issues/190)
- **Blender & 3D placement (Phase 6):**
  - [#195 Blender → three.js: prototype a 3D placement view, then build it for the phone](https://github.com/Pritesh1980/sable/issues/195) — **in progress**
  - [#206 3D placement: add a forearm mesh and open 3D preview from Brief ideas](https://github.com/Pritesh1980/sable/issues/206) (`question`)
  - [#193 Blender: repair and preview relief STLs before printing](https://github.com/Pritesh1980/sable/issues/193) (`question`)
  - [#194 Blender: render demo and guide imagery from fictional pieces](https://github.com/Pritesh1980/sable/issues/194) (`question`)
- **AWS / Deployment:**
  - [#5 AWS backend adapter (Cognito + API store + S3 blobs)](https://github.com/Pritesh1980/sable/issues/5)
  - [#6 Deploy to S3 + CloudFront](https://github.com/Pritesh1980/sable/issues/6) (`deployment`)

This list goes stale; the issue tracker is the source of truth.

Capture new items as issues (the GitHub mobile app works well for this); keep this
file as a pointer only.
