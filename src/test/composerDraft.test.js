import { describe, it, expect, beforeEach } from 'vitest'
import { loadComposerDraft, saveComposerDraft, clearComposerDraft, COMPOSER_DRAFT_KEY } from '../data/composerDraft'

describe('composerDraft', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns an empty draft when nothing is stored', () => {
    expect(loadComposerDraft()).toEqual({ steerArtistId: '', idea: '', placement: '' })
  })

  it('round-trips a saved draft', () => {
    saveComposerDraft({ steerArtistId: 'zoia.ink', idea: 'A raven', placement: 'forearm' })
    expect(loadComposerDraft()).toEqual({ steerArtistId: 'zoia.ink', idea: 'A raven', placement: 'forearm' })
  })

  it('clears the draft', () => {
    saveComposerDraft({ steerArtistId: 'zoia.ink', idea: 'A raven', placement: 'forearm' })
    clearComposerDraft()
    expect(localStorage.getItem(COMPOSER_DRAFT_KEY)).toBeNull()
    expect(loadComposerDraft()).toEqual({ steerArtistId: '', idea: '', placement: '' })
  })

  it('tolerates corrupt JSON', () => {
    localStorage.setItem(COMPOSER_DRAFT_KEY, '{not json')
    expect(loadComposerDraft()).toEqual({ steerArtistId: '', idea: '', placement: '' })
  })
})
