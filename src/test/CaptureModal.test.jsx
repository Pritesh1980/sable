import { StrictMode, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import AddArtistModal from '../components/AddArtistModal'
import { uploadImages } from '../hooks/useImageUpload'
import { analyzeScreenshotWithGemini } from '../data/screenshotIntake'
import { backend } from '../backend'

vi.mock('../hooks/useImageUpload', () => ({ uploadImages: vi.fn(), compressImages: vi.fn() }))
vi.mock('../data/screenshotIntake', () => ({ analyzeScreenshotWithGemini: vi.fn() }))
vi.mock('../data/styleIndex', () => ({ loadVectors: vi.fn(async () => new Map()) }))
const photo = () => new File(['fixture'], 'fixture.png', { type: 'image/png' })
let latest, update
function open(props = {}, seed = []) {
  const { initialFile: firstFile, ...modalProps } = props
  const onClose = vi.fn(), onSaved = vi.fn(), onManage = vi.fn()
  function Harness({ initialFile }) {
    const [artists, setArtists] = useState(seed)
    latest = artists
    update = setArtists
    return <MemoryRouter><AddArtistModal artists={artists} setArtists={setArtists}
      onClose={onClose} onSaved={onSaved} onManage={onManage} initialFile={initialFile} {...modalProps} /></MemoryRouter>
  }
  const view = render(<StrictMode><Harness initialFile={firstFile} /></StrictMode>)
  return { ...view, onClose, onSaved, onManage,
    nextFile: (initialFile) => view.rerender(<StrictMode><Harness initialFile={initialFile} /></StrictMode>) }
}
function handle(value = 'mora.blackfern') {
  fireEvent.change(screen.getByPlaceholderText(/handle or instagram url/i), { target: { value } })
}
function attach() {
  fireEvent.change(screen.getByLabelText(/choose files/i), { target: { files: [photo()] } })
}
beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  uploadImages.mockReset().mockResolvedValue(['fixture-saved.jpg'])
})
describe('compact capture', () => {
  it('starts with collapsed optional details and no automatic clipboard read', () => {
    const read = vi.fn()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read } })
    open()
    expect(screen.getByText('Details').closest('details')).not.toHaveAttribute('open')
    expect(read).not.toHaveBeenCalled()
  })
  it('saves a profile link without optional edits and emits one local receipt', async () => {
    const { onSaved, onClose } = open()
    handle('https://www.instagram.com/mora.blackfern/?igsh=test')
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledExactlyOnceWith({ kind: 'created', artistId: 'mora.blackfern', imageCount: 0 }))
    expect(latest[0]).toMatchObject({ status: 'researching', name: '', tags: [] })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('rejects post links without starting an upload', () => {
    open()
    handle('https://www.instagram.com/p/ABC123/')
    fireEvent.submit(screen.getByRole('dialog'))
    expect(screen.getByRole('alert')).toHaveTextContent(/not a post or reel link/i)
    expect(uploadImages).not.toHaveBeenCalled()
  })
  it('attaches each shared File once across StrictMode and preserves edits on rerender', () => {
    const first = photo()
    const view = open({ initialFile: first })
    handle('user.edit')
    view.nextFile(first)
    expect(screen.getAllByAltText(/staged reference/i)).toHaveLength(1)
    view.nextFile(photo())
    expect(screen.getAllByAltText(/staged reference/i)).toHaveLength(2)
    expect(screen.getByPlaceholderText(/handle or instagram url/i)).toHaveValue('user.edit')
  })
  it('ignores a shared non-image', () => {
    open({ initialFile: new File(['text'], 'note.txt', { type: 'text/plain' }) })
    expect(screen.queryByAltText(/staged reference/i)).not.toBeInTheDocument()
  })
  it('does not auto-analyse an attachment even when a key exists', () => {
    localStorage.setItem('gemini_api_key', 'fictional-key')
    open(); attach()
    expect(screen.getByRole('button', { name: 'Auto-fill' })).toBeInTheDocument()
    expect(analyzeScreenshotWithGemini).not.toHaveBeenCalled()
  })
  it('retains optional status and style note', async () => {
    open(); handle()
    fireEvent.click(screen.getByText('Details'))
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'shortlisted' } })
    fireEvent.change(screen.getByLabelText('Style note'), { target: { value: 'Manual note' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(latest[0]).toMatchObject({ status: 'shortlisted', styleNote: 'Manual note' }))
  })
  it('ignores Escape intended for a nested dialog', () => {
    const { onClose } = open()
    const nested = document.createElement('div')
    nested.setAttribute('aria-modal', 'true'); document.body.append(nested)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    nested.remove()
  })
  it('clears a drag highlight on drop', () => {
    open()
    const zone = screen.getByTestId('capture-images')
    fireEvent.dragOver(zone)
    expect(zone.className).toContain('border-v2-accent')
    fireEvent.drop(zone, { dataTransfer: { files: [photo()] } })
    expect(zone.className).not.toContain('border-v2-accent')
  })
  it('retains fields and photos after clipboard denial', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read: async () => { throw new DOMException('', 'NotAllowedError') } } })
    open(); handle(); attach()
    fireEvent.click(screen.getByRole('button', { name: /paste/i }))
    expect(await screen.findByText(/choose a photo or paste a profile link/i)).toBeInTheDocument()
    expect(screen.getByAltText(/staged reference/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/handle or instagram url/i)).toHaveValue('mora.blackfern')
  })
  it('asks before replacing an edited handle from the clipboard', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => '@different.artist' } })
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    open(); handle()
    fireEvent.click(screen.getByRole('button', { name: /paste/i }))
    await waitFor(() => expect(window.confirm).toHaveBeenCalled())
    expect(screen.getByPlaceholderText(/handle or instagram url/i)).toHaveValue('mora.blackfern')
  })
  it.each(['Cancel', 'Escape', 'backdrop', 'manage'])('guards dirty %s dismissal', (path) => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { onClose, onManage } = open()
    handle(); attach()
    if (path === 'Cancel') fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    if (path === 'Escape') fireEvent.keyDown(document, { key: 'Escape' })
    if (path === 'backdrop') fireEvent.click(screen.getByRole('dialog').parentElement)
    if (path === 'manage') fireEvent.click(screen.getByText(/full manage view/i))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    expect(onManage).not.toHaveBeenCalled()
    expect(screen.getByAltText(/staged reference/i)).toBeInTheDocument()
  })
  it('permits confirmed discard', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { onClose } = open(); attach()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('retains capture and permits retry after a failed upload', async () => {
    uploadImages.mockRejectedValueOnce(new Error('failed'))
    const { onSaved, onClose } = open(); handle(); attach()
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/try again/i)
    expect(onSaved).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByAltText(/staged reference/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
  })
  it('blocks repeat submit and dismissal while saving', async () => {
    let resolve
    uploadImages.mockImplementationOnce(() => new Promise((r) => { resolve = r }))
    const { onClose } = open(); handle(); attach()
    fireEvent.submit(screen.getByRole('dialog')); fireEvent.submit(screen.getByRole('dialog'))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(uploadImages).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => resolve(['saved.jpg']))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
  it('retains an image arriving after the upload snapshot instead of closing', async () => {
    let resolve
    uploadImages.mockImplementationOnce(() => new Promise((r) => { resolve = r }))
    const view = open(); handle(); attach()
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    view.nextFile(photo())
    await act(async () => resolve(['saved.jpg']))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(view.onSaved).not.toHaveBeenCalled()
    expect(view.onClose).not.toHaveBeenCalled()
    expect(screen.getAllByAltText(/staged reference/i)).toHaveLength(2)
    expect(latest).toEqual([])
  })
  it('appends to a case-insensitive duplicate without reverting concurrent metadata', async () => {
    let resolve
    uploadImages.mockImplementationOnce(() => new Promise((r) => { resolve = r }))
    const original = { id: 'mora.blackfern', handle: 'mora.blackfern', generation: 'one', name: 'Mora', tags: ['blackwork'], notes: 'Keep', rank: 3, status: 'shortlisted', images: ['old.jpg'] }
    const { onSaved } = open({}, [original]); handle('@MORA.BLACKFERN'); attach()
    fireEvent.click(screen.getByRole('button', { name: /add images to/i }))
    act(() => update((prev) => prev.map((a) => ({ ...a, notes: 'Newer note' }))))
    await act(async () => resolve(['saved.jpg']))
    await waitFor(() => expect(onSaved).toHaveBeenCalledExactlyOnceWith({ kind: 'images-added', artistId: original.id, imageCount: 1 }))
    expect(latest[0]).toMatchObject({ ...original, notes: 'Newer note', images: ['old.jpg', expect.objectContaining({ url: 'saved.jpg' })] })
  })
  it('disables duplicate append with no photos', () => {
    open({}, [{ id: 'mora.blackfern', handle: 'mora.blackfern', images: [] }]); handle()
    expect(screen.getByRole('button', { name: /add images to/i })).toBeDisabled()
  })
  it.each(['removed', 'replaced', 'owner'])('does not claim success after target is %s during upload', async (change) => {
    let resolve
    uploadImages.mockImplementationOnce(() => new Promise((r) => { resolve = r }))
    const { onSaved, onClose } = open({}, [{ id: 'mora.blackfern', handle: 'mora.blackfern', generation: 'one', images: [] }])
    handle(); attach(); fireEvent.click(screen.getByRole('button', { name: /add images to/i }))
    if (change === 'owner') backend.ownerScope.invalidate()
    else act(() => update(change === 'removed' ? [] : [{ id: 'mora.blackfern', handle: 'mora.blackfern', generation: 'two', images: [] }]))
    await act(async () => resolve(['saved.jpg']))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled()
    expect(latest.every((a) => !a.images.length)).toBe(true)
  })
  it('accepts dropped and pasted photos while ignoring non-images', () => {
    open()
    const zone = screen.getByTestId('capture-images')
    fireEvent.drop(zone, { dataTransfer: { files: [photo(), new File(['x'], 'x.txt', { type: 'text/plain' })] } })
    fireEvent.paste(screen.getByRole('dialog'), { clipboardData: { files: [photo()] } })
    expect(screen.getAllByAltText(/staged reference/i)).toHaveLength(2)
  })
})
