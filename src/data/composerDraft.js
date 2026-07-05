// Device-local (NOT synced) persistence for the Concepts composer draft — same
// class of data as tattoo_theme/tattoo_font. Survives a reload so an
// in-progress idea isn't lost, and clears once the concept is actually saved.

export const COMPOSER_DRAFT_KEY = 'tattoo_composer_draft'

const EMPTY_DRAFT = { steerArtistId: '', idea: '', placement: '' }

export function loadComposerDraft() {
  try {
    const stored = localStorage.getItem(COMPOSER_DRAFT_KEY)
    if (!stored) return { ...EMPTY_DRAFT }
    const parsed = JSON.parse(stored)
    return {
      steerArtistId: typeof parsed.steerArtistId === 'string' ? parsed.steerArtistId : '',
      idea: typeof parsed.idea === 'string' ? parsed.idea : '',
      placement: typeof parsed.placement === 'string' ? parsed.placement : '',
    }
  } catch {
    return { ...EMPTY_DRAFT }
  }
}

export function saveComposerDraft(draft) {
  localStorage.setItem(COMPOSER_DRAFT_KEY, JSON.stringify({
    steerArtistId: draft.steerArtistId || '',
    idea: draft.idea || '',
    placement: draft.placement || '',
  }))
}

export function clearComposerDraft() {
  localStorage.removeItem(COMPOSER_DRAFT_KEY)
}
