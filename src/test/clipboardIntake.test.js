import { describe, expect, it, vi } from 'vitest'
import { readCaptureClipboard } from '../data/clipboardIntake'

describe('capture clipboard', () => {
  it('prefers an image over text without reading HTML', async () => {
    const getType = vi.fn(async (type) => new Blob(['fixture'], { type }))
    const result = await readCaptureClipboard({ read: async () => [
      { types: ['text/plain', 'text/html'], getType },
      { types: ['image/png'], getType },
    ] })
    expect(result).toMatchObject({ kind: 'image', file: { type: 'image/png' } })
    expect(getType).toHaveBeenCalledExactlyOnceWith('image/png')
  })
  it('reads plain text once', async () => {
    const read = vi.fn(async () => [{ types: ['text/plain'], getType: async () => new Blob(['@mora.blackfern']) }])
    expect(await readCaptureClipboard({ read })).toEqual({ kind: 'text', text: '@mora.blackfern' })
    expect(read).toHaveBeenCalledTimes(1)
  })
  it('uses readText only when read is absent', async () => {
    expect(await readCaptureClipboard({ readText: async () => 'mora.blackfern' })).toEqual({ kind: 'text', text: 'mora.blackfern' })
  })
  it('does not retry after denial', async () => {
    const readText = vi.fn()
    expect(await readCaptureClipboard({ read: async () => { throw new DOMException('', 'NotAllowedError') }, readText }))
      .toEqual({ kind: 'manual', reason: 'denied' })
    expect(readText).not.toHaveBeenCalled()
  })
  it('offers manual input when clipboard is unsupported', async () => {
    expect(await readCaptureClipboard()).toEqual({ kind: 'manual', reason: 'unsupported' })
  })
  it('offers manual input for an empty clipboard', async () => {
    expect(await readCaptureClipboard({ read: async () => [] })).toEqual({ kind: 'manual', reason: 'empty' })
    expect(await readCaptureClipboard({ readText: async () => ' ' })).toEqual({ kind: 'manual', reason: 'empty' })
  })
  it('does not try other types after unreadable image data', async () => {
    expect(await readCaptureClipboard({ read: async () => [{ types: ['image/png', 'text/html'], getType: async () => { throw new Error() } }] }))
      .toEqual({ kind: 'manual', reason: 'unreadable' })
  })
})
