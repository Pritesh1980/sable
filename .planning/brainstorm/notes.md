# Brainstorm notes — Sable usability revamp

## Captured 2026-07-03 (1)

**From audit (agreed context):**
- Core loop: look at artists' styles → collect artists → generate concepts in style. Everything else secondary.
- Style Wall (best view) hidden behind ▦ glyph; default filmstrip = 24px thumbs; 3 clicks to full-screen; no true full-screen browse.
- "Too dark" = mid-tone contrast failures (cream-muted/40 ≈ 1.5:1, /30 ≈ 1.1:1) + ink-black/90 gradient overlays dimming portfolio images. Keep dark aesthetic, fix mid-tones, un-dim images.
- Dashboard is CRM-shaped (~21 controls, 6 panels). 10 hidden features. Laptop-first; mobile deprioritised.

**User decisions this session:**
1. **Opening experience = immersive feel of favourite artists' designs, then personal concepts.** Dashboard-as-home retired.
2. **Wants recent artist posts surfaced** ("new images artists posted recently") — feasibility risk: Instagram has no sanctioned read API for third parties; needs honest options (manual drop remains primary; link-outs; possibly RSS bridge). Flag in STRESS.
3. **Full-screen approach: HYBRID** — fast DOM lightbox core + WebGL/three.js flourishes (transitions, depth), not a full WebGL app.
4. **Power features that earned keep:** AI concept generation + 3D STL export (still experimenting — keep prominent-ish), quick add-artist flow.
5. Not defended (candidates to demote/hide): ranking, shortlist statuses, boards, conventions, studios, pipeline dashboard.

## Captured 2026-07-04 (2)
- Mockups approved in principle ("looks good"): Wall home, full-screen viewer w/ G-generate, concepts slide-in composer. Hover fixed (no scale, caption pointer-events none).
- **Style filters removed from the Wall** — user doesn't need them. Bar is now: wordmark · + Add artist · ⋯ drawer. (Tags still exist in data for concept steering/matching; just no filter UI on home.)
- Defaults chosen to keep momentum (user can veto at lock): mixed/shuffled wall (not grouped by artist — grouping lives in the viewer via ↑/↓); hover captions stay; no separate three.js demo tab — prove the WebGL flourish in the build's first slice, with graceful fallback to plain crossfade.
