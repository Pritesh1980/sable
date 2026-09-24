# Realistic demo portfolios

Approved direction: six fictional artists, three original AI-generated images each.
Keep the current artist identities, ranks and statuses. No real collection changes.
The approved in-conversation plan and contact sheet are the visual brief.

## Execution ledger

- [x] Create isolated `codex/demo-realistic-portfolios` worktree.
- [x] Baseline: 150 test files / 1,405 tests passed.
- [x] Asset manifest, optimised WebP masters and thumbnail derivatives.
- [x] Version-four demo seed, coherent descriptions and linked ideas.
- [x] Responsive gallery images and persistent generated-art disclosure.
- [x] Tests, production builds at both bases, mobile and desktop browser checks.
- [x] Updated Help, documentation and demo-only guide screenshots.
- [ ] Independent review and final user preview; no push or publication.

## Safety and acceptance

- Named artwork stays outside the repository until explicit public-use consent.
- Gujarati/Japanese artwork is a generated concept, not a verified tattoo stencil.
- Keep old SVGs available for saved demo references.
- Preserve base-relative string image paths; apply deployment base only at display.
- New artwork uses new filenames: browser/SW and CLIP caches key by image path.
- Version upgrade retains existing reseed behaviour: demo artist/idea edits reset;
  real sessions, unrelated collections and intro-dismissal preference stay intact.
- Persistent disclosure must not depend on editable notes or the dismissed intro.
- Full images target at most 350 KiB each; thumbnails at most 80 KiB each.
- Gallery views use thumbnails/responsive sources; full-screen keeps full detail.
- Offline verification covers images already visited, not uncached first visits.
- No external design-review retry without permission to share project/personal data.

## Rulings

- Preserve the existing persisted image schema; derive responsive variants from a
  static allowlisted manifest instead of adding thumbnail fields to synced records.
  Cost if wrong: manifest entries must be updated alongside every new shipped image.
- No commit until consent and verification gates pass. Work remains inspectable as
  an uncommitted worktree diff, consistent with the final-preview checkpoint.
- Public-use consent received 2026-09-24 for both personalised “Pritesh” images.
  This authorises their compressed demo derivatives in the public repository;
  the generated originals remain outside Git.
- Include the viewer colour-space fix in this change. The realistic photographs
  exposed a pre-existing WebGL path that decoded sRGB textures without encoding
  the blended result for display. Cost if wrong: all full-screen artwork colour
  could shift; covered by a shader regression and real-browser pixel comparison.

## Verification checkpoint — 2026-09-24

- All 18 full images are 1024 × 1536 WebP at 68–235 KiB; all 18 responsive
  thumbnails are 384 × 576 at 9–26 KiB. Total shipped artwork is about 2.7 MiB.
- `npm test`: 151 files / 1,421 tests passed. `npm run lint` and
  `npm run docs:check` passed; 20 Mermaid diagrams parsed across four documents.
- Production builds passed at `/` and `/sable/`. Chromium passed at desktop and
  430px touch/mobile viewports across the Wall, all four gallery modes and Ideas,
  including all 18 unique images, the personalised artwork, no page errors, no
  horizontal page overflow and warmed-cache offline reloads.
- Initial Wall image transfer measured about 299 KiB desktop and 935 KiB on the
  3× mobile context. WebGL/plain-image patch colour means differed by at most
  1.48/255 after the colour-space fix.
- Recaptured all guide screenshots affected by the demo artwork; the Concepts
  pair is 1280 × 900 as specified by the maintenance guide.
