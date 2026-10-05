import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const getUrl = vi.fn()
vi.mock('../backend', () => ({
  backend: { blobs: { getUrl: (...args) => getUrl(...args) } },
}))
const stageImage = vi.fn()
vi.mock('../data/imageStaging', async (importOriginal) => ({
  ...(await importOriginal()),
  stageImage: (...args) => stageImage(...args),
}))
let signedIn = { id: 'u2' }
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: signedIn }) }))

const { registerBlobUrl, clearBlobUrls } = await import('../data/blobUrls')
const { default: BackupPanel } = await import('../components/BackupPanel')

const PNG = 'data:image/png;base64,iVBORw0KGgo='
let downloaded
let setIdeas
let setArtists

function renderPanel(props = {}) {
  setIdeas = vi.fn()
  setArtists = vi.fn()
  return render(
    <BackupPanel
      artists={[]} setArtists={setArtists}
      ideas={[]} setIdeas={setIdeas}
      boards={[]} setBoards={vi.fn()}
      concepts={[]} setConcepts={vi.fn()}
      conventionOverrides={{}} setConventionOverrides={vi.fn()}
      {...props}
    />,
  )
}

beforeEach(() => {
  clearBlobUrls()
  getUrl.mockReset()
  stageImage.mockReset()
  signedIn = { id: 'u2' }
  downloaded = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn((blob) => { downloaded = blob; return 'blob:download' }),
    revokeObjectURL: vi.fn(),
  }))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['AAAA'], { type: 'image/png' }) })))
})
afterEach(() => vi.unstubAllGlobals())

describe('BackupPanel export (v2, #114)', () => {
  it('downloads a v2 backup with the photo bytes embedded', async () => {
    registerBlobUrl('user/u1/ideas/i/1.jpg', 'https://signed.example/a')
    renderPanel({ ideas: [{ id: 'i', images: [{ url: 'https://signed.example/a', note: 'n', key: 'user/u1/ideas/i/1.jpg' }] }] })
    fireEvent.click(screen.getByRole('button', { name: /export backup/i }))
    expect(await screen.findByText('Backup exported.')).toBeInTheDocument()

    const backup = JSON.parse(await downloaded.text())
    expect(backup.version).toBe(2)
    expect(backup.data.ideas[0].images).toEqual([{ url: `data:image/png;base64,${btoa('AAAA')}`, note: 'n' }])
  })

  it('says how many photos could not be read and were left out', async () => {
    getUrl.mockRejectedValue(new Error('offline'))
    renderPanel({ ideas: [{ id: 'i', images: [{ key: 'user/u1/ideas/i/gone.jpg' }, { key: 'user/u1/ideas/i/gone2.jpg' }] }] })
    fireEvent.click(screen.getByRole('button', { name: /export backup/i }))
    expect(await screen.findByText(/2 photos couldn't be read/i)).toBeInTheDocument()
  })
})

describe('BackupPanel import (#114)', () => {
  const fileOf = (backup) => new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })
  const importFile = (backup) => {
    const input = document.querySelector('input[type="file"]')
    fireEvent.change(input, { target: { files: [fileOf(backup)] } })
  }

  it('restores embedded photos through the staging path before setting state', async () => {
    stageImage.mockResolvedValue({ key: 'user/u2/ideas/i/new.jpg', url: 'staged-url' })
    renderPanel()
    importFile({ version: 2, data: { ideas: [{ id: 'i', images: [{ url: PNG, note: 'n' }] }] } })
    expect(await screen.findByText('Backup imported.')).toBeInTheDocument()
    expect(stageImage).toHaveBeenCalledWith(PNG, { userId: 'u2', scope: 'ideas', id: 'i' })
    expect(setIdeas).toHaveBeenCalledWith([{ id: 'i', images: [{ url: 'staged-url', note: 'n' }] }])
  })

  it('still imports a v1 backup with no embedded photos', async () => {
    renderPanel()
    importFile({ version: 1, data: { artists: [{ id: 'a', images: ['images/a.jpg'] }] } })
    expect(await screen.findByText('Backup imported.')).toBeInTheDocument()
    expect(setArtists).toHaveBeenCalledWith([{ id: 'a', images: ['images/a.jpg'] }])
    expect(stageImage).not.toHaveBeenCalled()
  })

  it('says when photos could not be saved', async () => {
    stageImage.mockResolvedValue({ key: null, url: '', failed: true })
    renderPanel()
    importFile({ version: 2, data: { ideas: [{ id: 'i', images: [PNG] }] } })
    expect(await screen.findByText(/1 photo couldn't be saved/i)).toBeInTheDocument()
  })

  it('refuses a backup from a newer version and changes nothing', async () => {
    renderPanel()
    importFile({ version: 3, data: { artists: [{ id: 'a' }] } })
    expect(await screen.findByText(/newer version of Sable/i)).toBeInTheDocument()
    await waitFor(() => expect(setArtists).not.toHaveBeenCalled())
  })
})
