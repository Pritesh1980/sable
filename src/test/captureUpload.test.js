import { afterEach, expect, it, vi } from 'vitest'
import { compressImages, uploadImages } from '../hooks/useImageUpload'
import { backend } from '../backend'
import { putStagedBytes, getStagedBytes, readOutbox } from '../data/stagedImageStore'
import { keyForUrl } from '../data/blobUrls'

vi.mock('../data/stagedImageStore', async (importOriginal) => ({
  ...(await importOriginal()), putStagedBytes: vi.fn((...args) => importOriginal().then((module) => module.putStagedBytes(...args))),
}))

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })
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
function mockPhoto() {
  mockReader()
  vi.stubGlobal('Image', class { width = 2; height = 2; set src(_) { this.onload() } })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() })
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,eA==')
}
it('strict capture rejects only when neither staging nor upload can preserve the photo', async () => {
  mockPhoto()
  putStagedBytes.mockRejectedValueOnce(new Error('device full'))
  vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('storage failed'))
  await expect(uploadImages([file], { userId: 'fictional', scope: 'artists', id: 'fixture', requireStored: true })).rejects.toThrow(/store/i)
})
it('strict capture preserves a durable local photo and queues its upload while offline', async () => {
  mockPhoto()
  vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('offline'))
  const [url] = await uploadImages([file], { userId: 'fictional', scope: 'artists', id: 'fixture', requireStored: true })
  const key = keyForUrl(url)
  expect(await getStagedBytes(key)).toBe(url)
  expect(readOutbox()).toContainEqual(expect.objectContaining({ key, userId: 'fictional' }))
})
it('strict photo captures need an authenticated destination', async () => {
  await expect(uploadImages([file], { scope: 'artists', id: 'fixture', requireStored: true })).rejects.toThrow(/owner/i)
})
