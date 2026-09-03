// Line-ups that ship with the app.
//
// The artist index normally starts empty and is filled by import — the show's
// list is someone else's data and is re-importable in seconds, which is why
// stored line-ups are device-local rather than synced. Big London 2026 is the
// exception: the owner had the published exhibitor list to hand, and having it
// already there (with booth numbers) is the difference between planning the
// show and doing data entry the night before.
//
// A seed is a floor, not a fixture. Whatever the user imports merges on top and
// wins on conflicts, so a later, fuller line-up corrects a booth number rather
// than sitting next to it, and clearing the list stays cleared.
import { mergeLineupEntries, parseLineup } from './lineup'
import { BIG_LONDON_2026 } from './lineups/bigLondon2026'
import { BIG_LONDON_2026_PICKS } from './lineups/bigLondon2026Picks'

export const LINEUP_SEEDS = {
  'big-london': BIG_LONDON_2026,
}

// Parsed once per seed. The raw text goes through the same strict parser a
// hand-paste does, so the shipped list cannot be a shape the import path would
// have rejected.
const parsed = new Map()

export function seedEntriesFor(conventionId) {
  const raw = LINEUP_SEEDS[conventionId]
  if (!raw) return []
  if (!parsed.has(conventionId)) parsed.set(conventionId, parseLineup(raw))
  return parsed.get(conventionId)
}

// The entries to show for a convention: the shipped list with the user's own
// imports merged over it. `cleared` is what makes "Clear list" honest — without
// it the seed would reappear the moment the user removed it.
export function mergeLineupSeeds(stored = {}, conventionId) {
  const record = stored?.[conventionId]
  const imported = record?.entries || []
  if (record?.cleared) return imported
  return mergeLineupEntries(seedEntriesFor(conventionId), imported)
}

// Hand-curated shortlists that ship with the app, keyed by convention id and
// then by the handle the show lists. Separate from the line-up seeds above
// because this is the user's own judgement about who matters, not the show's
// roster — see bigLondon2026Picks.js for what the tiers mean.
export const CURATED_PICKS = {
  'big-london': BIG_LONDON_2026_PICKS,
}
