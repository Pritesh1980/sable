// Review-fix coverage: ALL generation paths must honour the steer artist and
// placement — not just Gemini. "Generate in this style" parity.
import { describe, it, expect } from 'vitest'
import { buildImagePrompt } from '../data/conceptPrompts'

const steer = {
  styleDescriptor: 'heavy blackwork with engraved linework',
  tags: ['dark-illustrative', 'blackwork'],
  placement: 'upper arm',
}

describe('buildImagePrompt', () => {
  it('works unsteered (back-compat)', () => {
    const p = buildImagePrompt('a raven on a pocket watch')
    expect(p).toContain('a raven on a pocket watch')
    expect(p).toContain('tattoo')
  })

  it('folds style descriptor, tags and placement into the prompt', () => {
    const p = buildImagePrompt('a raven on a pocket watch', steer)
    expect(p).toContain('heavy blackwork with engraved linework')
    expect(p).toContain('dark-illustrative')
    expect(p).toContain('upper arm')
  })
})

describe('buildImagePrompt punctuation', () => {
  // Copy prompt shows this text to the user now (#156); an idea written as a
  // full sentence must not produce "shading.. in the style of".
  it('does not double the full stop after an idea that ends in one', () => {
    const p = buildImagePrompt('A raven, heavy black shading. ', steer)
    expect(p).toContain('heavy black shading. in the style of')
    expect(p).not.toContain('..')
  })
})

describe('buildImagePrompt steer fragment', () => {
  it('omits steer language when fields are empty', () => {
    const p = buildImagePrompt('a raven', { styleDescriptor: '', tags: [], placement: '' })
    expect(p).not.toContain('in the style of')
    expect(p).not.toContain('Placement:')
  })
})
