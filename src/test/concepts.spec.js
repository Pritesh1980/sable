import { describe, it, expect } from 'vitest'
import { buildConceptWallItems } from '../data/concepts'

const artists = [
  { id: 'zoia.ink', handle: 'zoia.ink', name: '', tags: ['dark-illustrative'] },
  { id: 'victorportugal', handle: 'victorportugal', name: 'Victor Portugal', tags: ['blackwork'] },
]

describe('buildConceptWallItems', () => {
  it('only includes concepts with a saved image', () => {
    const concepts = [
      { id: '1', prompt: 'A raven', imageUrl: '' },
      { id: '2', prompt: 'A moth', imageUrl: 'data:image/png;base64,abc' },
    ]
    const items = buildConceptWallItems(concepts, artists)
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('2')
  })

  it('resolves steered artist name from steerArtistId', () => {
    const concepts = [
      { id: '1', prompt: 'A raven', imageUrl: 'x.png', steerArtistId: 'zoia.ink', tags: ['dark-illustrative'] },
    ]
    const [item] = buildConceptWallItems(concepts, artists)
    expect(item.steerArtistName).toBe('@zoia.ink')
    expect(item.tags).toEqual(['dark-illustrative'])
  })

  it('falls back to an empty steered name when unsteered', () => {
    const concepts = [{ id: '1', prompt: 'A wolf', imageUrl: 'x.png' }]
    const [item] = buildConceptWallItems(concepts, artists)
    expect(item.steerArtistName).toBe('')
  })

  it('counts variants', () => {
    const concepts = [
      { id: '1', prompt: 'A moth', imageUrl: 'x.png', variants: [{ id: 'v1' }, { id: 'v2' }] },
    ]
    const [item] = buildConceptWallItems(concepts, artists)
    expect(item.variantsCount).toBe(2)
  })

  it('defaults an empty prompt to Untitled concept', () => {
    const concepts = [{ id: '1', prompt: '', imageUrl: 'x.png' }]
    const [item] = buildConceptWallItems(concepts, artists)
    expect(item.title).toBe('Untitled concept')
  })
})
