// A hand-curated shortlist for Big London 2026, from the owner's own field
// guide (3 Sep 2026) — research done outside the app, brought in so Top picks
// reflects the plan actually made for the day rather than only what the gallery
// happens to contain.
//
// Provenance is the point here, and the tiers are not interchangeable:
//
//   'priority' — the owner's own Priority 1: the ones to see before the hall
//                fills. Researched and reasoned about, though several have not
//                been seen in person yet.
//   'wildcard' — suggested by ChatGPT from conversations about the owner's
//                taste. Deliberately speculative and, in the owner's words,
//                "I don't know if I'll like them yet". They are here to be
//                judged, not because they are known-good, and the UI must not
//                present them with the confidence of the tiers above.
//
// Keyed by the handle the SHOW lists, not the one the field guide gives, so
// these actually match the line-up. One differs: the guide has Clara Grech as
// @claragrechtattoo, while the show lists her as @zap.ink (name and studio both
// match, so it is the same artist and the show is the better source).
//
// `why` is shown to the user as the reason for the pick, so it is written in
// their own terms.
export const BIG_LONDON_2026_PICKS = {
  thomascarlijarlier: {
    tier: 'priority',
    why: 'Benchmark booth — 2026 guest judge for Black & Grey & Realism',
  },
  'tolgatemirlenk.ink': {
    tier: 'priority',
    why: 'Existing favourite; serious sleeve candidate',
  },
  berkbosveren: {
    tier: 'priority',
    why: 'Existing favourite; compare live against Thomas and Tolga',
  },
  lennoxtattoo: {
    tier: 'priority',
    why: 'Strongest new wildcard — large-scale surreal, painterly composition',
  },
  davidcorden: {
    tier: 'priority',
    why: 'Technical-realism benchmark; 20+ years of portrait work',
  },
  'zap.ink': {
    tier: 'priority',
    why: 'Clara Grech — existing shortlist candidate, artistic fit',
  },
  silas_balaio: {
    tier: 'priority',
    why: 'Existing favourite; test the work live',
  },

  londonslade: {
    tier: 'wildcard',
    why: 'Traditional Japanese tebori — reference for the Japanese strand',
  },
  carterhewlett: {
    tier: 'wildcard',
    why: 'Black & grey realism with convincing chrome; London-based',
  },
  kubalizmus: {
    tier: 'wildcard',
    why: 'Martin Kubala — fine-art detail, relevant to the whale/cosmos idea',
  },
  atewamz: {
    tier: 'wildcard',
    why: 'Filipino batok — mark-making and texture inspiration',
  },
  jonnyransomtattoo: {
    tier: 'wildcard',
    why: 'Blackout and negative-space geometry; distance readability',
  },
}
