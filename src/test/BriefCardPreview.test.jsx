import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Brief from '../pages/Brief'
import { UndoProvider } from '../context/UndoContext'

let ctx
beforeEach(() => {
  ctx = {
    fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(),
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), measureText: (t) => ({ width: t.length * 12 }),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['png'], { type: 'image/png' })))
  vi.stubGlobal('Image', class {
    naturalWidth = 800
    naturalHeight = 600
    set src(value) { if (value) queueMicrotask(() => this.onload?.()) }
  })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
const images = [
  { url: '/a.png', note: 'First' },
  { url: '/a.png', note: 'Second', briefCrop: { x: 1, y: 0, zoom: 2 } },
  { url: '/c.png', note: 'Third' },
]
const idea = { id: 'i', title: 'A reference study', description: 'Old text', images, tags: [], linkedArtists: [] }
const tree = (ideas, setIdeas) => <MemoryRouter><UndoProvider><Brief ideas={ideas} setIdeas={setIdeas} artists={[]} /></UndoProvider></MemoryRouter>

it('saves occurrence ordering without overwriting unrelated concurrent edits', async () => {
  const setIdeas = vi.fn()
  const view = render(tree([idea], setIdeas))
  fireEvent.click(screen.getByText('A reference study'))
  fireEvent.click(await screen.findByRole('button', { name: 'Make reference 3 the cover' }))
  view.rerender(tree([{ ...idea, description: 'Changed remotely' }], setIdeas))
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
  const latest = setIdeas.mock.calls.at(-1)[0]([{ ...idea, description: 'Changed remotely' }])[0]
  expect(latest.description).toBe('Changed remotely')
  expect(latest.images.map((image) => image.note)).toEqual(['Third', 'First', 'Second'])
  expect(latest.images[2].briefCrop).toEqual({ x: 1, y: 0, zoom: 2 })
})

it('previews and crops one duplicate, keeps controls focused while preparing, and resets', async () => {
  const setIdeas = vi.fn()
  render(tree([idea], setIdeas))
  fireEvent.click(screen.getByText('A reference study'))
  fireEvent.click(screen.getByRole('button', { name: 'Preview card' }))
  const preview = await screen.findByRole('img', { name: 'Brief card preview' })
  expect(preview).toHaveAttribute('src', expect.stringContaining('blob:'))
  const horizontal = screen.getByRole('slider', { name: 'Horizontal reference 2' })
  horizontal.focus()
  fireEvent.change(horizontal, { target: { value: '0.25' } })
  expect(document.activeElement).toBe(horizontal)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Share this card' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Close card preview' }))
  fireEvent.change(screen.getAllByPlaceholderText('What to borrow from this image…')[1], { target: { value: 'Changed second' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
  const saved = setIdeas.mock.calls.at(-1)[0]([idea])[0]
  expect(saved.images[0]).toEqual(images[0])
  expect(saved.images[1]).toEqual({ url: '/a.png', note: 'Changed second', briefCrop: { x: 0.25, y: 0, zoom: 2 } })
})

it('discards ordering and crop changes on Back without saving', async () => {
  const setIdeas = vi.fn()
  render(tree([idea], setIdeas))
  fireEvent.click(screen.getByText('A reference study'))
  fireEvent.click(screen.getByRole('button', { name: 'Make reference 3 the cover' }))
  fireEvent.click(screen.getByRole('button', { name: '← Back' }))
  expect(setIdeas).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('A reference study'))
  expect(screen.getAllByPlaceholderText('What to borrow from this image…').map((el) => el.value))
    .toEqual(['First', 'Second', 'Third'])
})

it('reset removes only the selected export crop', async () => {
  const setIdeas = vi.fn()
  render(tree([idea], setIdeas))
  fireEvent.click(screen.getByText('A reference study'))
  fireEvent.click(screen.getByRole('button', { name: 'Preview card' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Reset crop reference 2' }))
  await waitFor(() => expect(screen.getByRole('slider', { name: 'Zoom reference 2' })).toHaveValue('1'))
  fireEvent.click(screen.getByRole('button', { name: 'Close card preview' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
  expect(setIdeas.mock.calls.at(-1)[0]([idea])[0].images[1]).toEqual({ url: '/a.png', note: 'Second' })
})

it('keeps the generated imagery disclosure visible in a demo preview', async () => {
  render(tree([{ ...idea, images: [{ url: 'images/demo/mora.blackfern/fern-v4.webp', note: 'Demo' }] }], vi.fn()))
  fireEvent.click(screen.getByText('A reference study'))
  fireEvent.click(screen.getByRole('button', { name: 'Preview card' }))
  expect(within(screen.getByRole('dialog', { name: 'Preview card' })).getByText(/AI-generated imagery/)).toBeVisible()
})

it('offers a visible retry instead of stranding a failed card preparation', async () => {
  HTMLCanvasElement.prototype.getContext.mockReturnValueOnce(null)
  render(tree([{ ...idea, images: [] }], vi.fn()))
  fireEvent.click(screen.getByText('A reference study'))
  expect(await screen.findByRole('button', { name: 'Refresh card' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Share as image' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh card' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Share as image' })).toBeEnabled())
})

it('removes and undoes the chosen duplicate without losing either note or crop', async () => {
  render(tree([idea], vi.fn()))
  fireEvent.click(screen.getByText('A reference study'))
  fireEvent.click(screen.getAllByRole('button', { name: 'Remove photo' })[1])
  expect(screen.getAllByPlaceholderText('What to borrow from this image…').map((input) => input.value))
    .toEqual(['First', 'Third'])
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(screen.getAllByPlaceholderText('What to borrow from this image…').map((input) => input.value))
    .toEqual(['First', 'Second', 'Third'])
  fireEvent.click(screen.getByRole('button', { name: 'Preview card' }))
  await waitFor(() => expect(screen.getByRole('slider', { name: 'Zoom reference 2' })).toHaveValue('2'))
})
