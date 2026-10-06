import { afterEach, expect, it, vi } from 'vitest'
import { compressImages, uploadImages } from '../hooks/useImageUpload'
import { backend } from '../backend'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
const file = new File(['fixture'], 'fixture.png', { type: 'image/png' })
function mockReader() {
  vi.stubGlobal('FileReader', class {
    readAsDataURL() { queueMicrotask(() => this.onload({ target: { result: 'data:image/png;base64,eA==' } })) }
  })
}
it('rejects unreadable files instead of leaving capture saving forever', async () => {
  vi.stubGlobal('FileReader', class {
    readAsDataURL() { queueMicrotask(() => this.onerror?.()) }
  })
  await expect(compressImages([file])).rejects.toThrow()
})
it('rejects image decode failures', async () => {
  mockReader()
  vi.stubGlobal('Image', class { set src(_) { queueMicrotask(() => this.onerror?.()) } })
  await expect(compressImages([file])).rejects.toThrow()
})
it('strict capture uploads reject storage failures rather than reporting a local save', async () => {
  mockReader()
  vi.stubGlobal('Image', class { width = 2; height = 2; set src(_) { this.onload() } })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() })
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,eA==')
  vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('storage failed'))
  await expect(uploadImages([file], { userId: 'fictional', scope: 'artists', id: 'fixture', requireStored: true })).rejects.toThrow('storage failed')
})
it('strict photo captures need an authenticated destination', async () => {
  await expect(uploadImages([file], { scope: 'artists', id: 'fixture', requireStored: true })).rejects.toThrow(/owner/i)
})
