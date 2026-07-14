import { describe, it, expect } from 'vitest'
import { buildIntakePrompt, parseIntakeResponse, buildIdeaPrompt, parseIdeaResponse, dataUrlParts } from '../data/screenshotIntake'
import { STYLE_TAGS, PLACEMENTS } from '../data/artists'

describe('buildIntakePrompt', () => {
  it('pins the format, the canonical tag set, and forbids invented handles', () => {
    const prompt = buildIntakePrompt()
    expect(prompt).toContain('handle | name | styles | note')
    for (const tag of STYLE_TAGS) expect(prompt).toContain(tag)
    expect(prompt).toMatch(/NEVER guess/i)
  })
})

describe('parseIntakeResponse', () => {
  it('parses a well-formed line, normalising the handle and filtering tags', () => {
    const out = parseIntakeResponse('@Inky_Artist | Inky Artist | blackwork, Fine-Line, not-a-tag | Bold woodcut blackwork.')
    expect(out).toEqual({
      handle: 'inky_artist',
      name: 'Inky Artist',
      tags: ['blackwork', 'fine-line'],
      styleNote: 'Bold woodcut blackwork.',
    })
  })

  it("treats '-' as unknown; a hidden handle still yields tags + note", () => {
    const out = parseIntakeResponse('- | - | dark-illustrative | Dense dotwork compositions.')
    expect(out.handle).toBe('')
    expect(out.tags).toEqual(['dark-illustrative'])
    expect(out.styleNote).toBe('Dense dotwork compositions.')
  })

  it('skips chatter and echoed headers to find the data line', () => {
    const out = parseIntakeResponse('Sure! Here is the line:\nhandle | name | styles | note\nreal_one | - | realism | Cinematic realism.')
    expect(out.handle).toBe('real_one')
  })

  it('returns null when nothing usable came back', () => {
    expect(parseIntakeResponse('I cannot see any Instagram profile here.')).toBeNull()
    expect(parseIntakeResponse('- | - | - | -')).toBeNull()
    expect(parseIntakeResponse('')).toBeNull()
  })

  it('drops handles outside Instagram’s charset (adversarial screenshot text)', () => {
    const out = parseIntakeResponse('evil.com/malware | X | blackwork | Legit-looking note.')
    expect(out.handle).toBe('')
    expect(out.tags).toEqual(['blackwork'])
    expect(parseIntakeResponse('ok_handle.name | - | realism | n').handle).toBe('ok_handle.name')
  })
})

describe('idea intake (inspiration image → draft idea)', () => {
  it('prompt pins the format, tag set and placement list', () => {
    const prompt = buildIdeaPrompt()
    expect(prompt).toContain('title | description | styles | placement')
    for (const p of PLACEMENTS) expect(prompt).toContain(p)
  })

  it('parses a draft idea and validates the placement against the app list', () => {
    const out = parseIdeaResponse('Night Forest | Branching botanicals fading into a starlit canopy. | dark-illustrative, fine-line | Forearm')
    expect(out).toEqual({
      title: 'Night Forest',
      description: 'Branching botanicals fading into a starlit canopy.',
      tags: ['dark-illustrative', 'fine-line'],
      placement: 'forearm',
    })
  })

  it('drops an off-list placement instead of inventing one', () => {
    expect(parseIdeaResponse('X | y | blackwork | left earlobe').placement).toBe('')
  })

  it('returns null when nothing usable came back', () => {
    expect(parseIdeaResponse('no idea here')).toBeNull()
    expect(parseIdeaResponse('- | - | - | -')).toBeNull()
  })
})

describe('dataUrlParts', () => {
  it('splits a data URL into mime + base64 payload', () => {
    expect(dataUrlParts('data:image/jpeg;base64,AAAB')).toEqual({ mimeType: 'image/jpeg', data: 'AAAB' })
  })
  it('returns null for non-data URLs', () => {
    expect(dataUrlParts('https://example.com/x.jpg')).toBeNull()
    expect(dataUrlParts('')).toBeNull()
  })
})
