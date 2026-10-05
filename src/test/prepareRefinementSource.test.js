import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Blob, File } from 'node:buffer'
import { createHash, webcrypto } from 'node:crypto'
import { prepareRefinementSource } from '../data/imageJobs/prepareSource'

let bitmap, context, output
beforeEach(() => {
  bitmap = { width: 2, height: 3, close: vi.fn() }
  output = new Blob(['prepared pixels'], { type: 'image/png' })
  context = { drawImage: vi.fn() }
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(output))
  vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:preview'), revokeObjectURL: vi.fn() })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('prepares orientation-correct PNG bytes, hashes those bytes, and closes the decoder', async () => {
  const input = new Blob(['original'], { type: 'image/jpeg' })
  const prepared = await prepareRefinementSource(input)
  expect(await prepared.blob.text()).toBe('prepared pixels')
  expect(prepared.digest).toBe(createHash('sha256').update('prepared pixels').digest('hex'))
  expect(prepared.previewUrl).toBe('blob:preview')
  expect(createImageBitmap).toHaveBeenCalledWith(input, { imageOrientation: 'from-image' })
  expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0)
  expect(bitmap.close).toHaveBeenCalledOnce()
  expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d', { alpha: true })
})

it.each([null, 'https://external.example/source.png', new Blob(['svg'], { type: 'image/svg+xml' }),
  new Blob([], { type: 'image/png' })])('rejects non-raster or empty source without decoding %j', async source => {
  await expect(prepareRefinementSource(source)).rejects.toMatchObject({ code: 'invalid_source' })
  expect(createImageBitmap).not.toHaveBeenCalled()
})

it('bounds decoded dimensions and closes rejected decoders', async () => {
  bitmap.width = 4001
  bitmap.height = 4000
  await expect(prepareRefinementSource(new Blob(['image'], { type: 'image/png' })))
    .rejects.toMatchObject({ code: 'source_too_large' })
  expect(bitmap.close).toHaveBeenCalledOnce()
})

it('accepts an explicitly selected raster File', async () => {
  const source = new File(['selected image'], 'photo.jpg', { type: 'image/jpeg' })
  expect((await prepareRefinementSource(source)).blob).toBe(output)
})

it('bounds both input and exported bytes', async () => {
  const large = new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: 'image/png' })
  await expect(prepareRefinementSource(large)).rejects.toMatchObject({ code: 'source_too_large' })
  expect(createImageBitmap).not.toHaveBeenCalled()
  HTMLCanvasElement.prototype.toBlob.mockImplementationOnce(callback => callback(large))
  await expect(prepareRefinementSource(new Blob(['image'], { type: 'image/webp' })))
    .rejects.toMatchObject({ code: 'source_too_large' })
  expect(URL.createObjectURL).not.toHaveBeenCalled()
})

it('rejects corrupt decode, unavailable canvas and failed PNG export with safe errors', async () => {
  createImageBitmap.mockRejectedValueOnce(new Error('private image path'))
  const input = new Blob(['image'], { type: 'image/png' })
  await expect(prepareRefinementSource(input)).rejects.toMatchObject({ code: 'source_unreadable' })
  HTMLCanvasElement.prototype.getContext.mockReturnValueOnce(null)
  await expect(prepareRefinementSource(input)).rejects.toMatchObject({ code: 'source_unreadable' })
  HTMLCanvasElement.prototype.toBlob.mockImplementationOnce(callback => callback(null))
  await expect(prepareRefinementSource(input)).rejects.toMatchObject({ code: 'source_unreadable' })
})
