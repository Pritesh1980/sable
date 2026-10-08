import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { conceptsCodec } from '../data/imageCodec'
import { isDraftConcept, buildConceptWallItems } from '../data/concepts'
import { clearBlobUrls } from '../data/blobUrls'
import { backend } from '../backend'

const KEY = 'user/u1/concepts/c1/main.jpg'
const VKEY = 'user/u1/concepts/c1/v1.jpg'
const concept = { id: 'c1', prompt: 'moth', imageUrl: KEY, variants: [{ id: 'v1', imageUrl: VKEY }] }

beforeEach(() => {
  localStorage.clear()
  clearBlobUrls()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('concept state holds stored refs', () => {
  it('toDisplay returns the stored value, online or offline', async () => {
    vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
    expect(await conceptsCodec.toDisplay([concept])).toEqual([concept])
  })

  it('toCanonical is the identity on stored concepts', () => {
    expect(conceptsCodec.toCanonical([concept])).toEqual([concept])
  })

  it('never leaves unresolvedImageKey behind', async () => {
    vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
    const [out] = await conceptsCodec.toDisplay([concept])
    expect('unresolvedImageKey' in out).toBe(false)
    expect('unresolvedImageKey' in out.variants[0]).toBe(false)
  })

  it('replaces a stored inline image and inline variant image with keys', async () => {
    const inline = { id: 'c2', prompt: 'koi', imageUrl: 'data:image/jpeg;base64,QUJD', variants: [{ id: 'v1', imageUrl: 'data:image/jpeg;base64,REVG' }] }
    const { value, moved } = await conceptsCodec.ensureUploaded([inline], { userId: 'u1' })
    expect(moved).toBe(2)
    expect(value[0].imageUrl).toMatch(/^user\/u1\/concepts\/c2\//)
    expect(value[0].variants[0].imageUrl).toMatch(/^user\/u1\/concepts\/c2\//)
    expect(value[0].variants[0].imageUrl).not.toBe(value[0].imageUrl)
  })

  it('returns the same value when nothing is inline', async () => {
    const rows = [concept]
    expect(await conceptsCodec.ensureUploaded(rows, { userId: 'u1' })).toEqual({ value: rows, moved: 0 })
  })
})

describe('drafts and wall items', () => {
  it('a concept with a stored key is not a draft, whether or not it can load', () => {
    expect(isDraftConcept({ imageUrl: KEY })).toBe(false)
    expect(isDraftConcept({ imageUrl: '' })).toBe(true)
    expect(isDraftConcept({})).toBe(true)
  })

  it('wall items carry the stored ref and no offline flag', () => {
    const [item] = buildConceptWallItems([concept], [])
    expect(item.imageUrl).toBe(KEY)
    expect('offline' in item).toBe(false)
  })
})
