import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Conventions from '../pages/Conventions'
import { createShowPackStore } from '../data/showPackStore'
import { preparePack } from '../data/showPackPrepare'
import { planShowPack } from '../data/showPack'

// #209 on Radar: prepare a show's artists, their photos and linked ideas on
// this phone, see honestly whether it is ready, open it, and remove it.

const NOV_2026 = new Date(2026, 10, 5)
const EDITION = 'uk-tattoo-fest@2027'
const KEY = 'user/A/artists/mora/a.jpg'

const artists = [
  { id: 'mora', handle: 'mora.blackfern', name: 'Mora Vane', rank: 2, tags: ['fine-line'], styleNote: 'Botanical fine-line', notes: '',
    images: [{ key: KEY }, 'images/demo/mora/1.webp', 'https://cdn.example.com/x.jpg'] },
  { id: 'vesper', handle: 'vesper_noctis', name: 'Vesper Ash', rank: 1, tags: [], images: ['images/demo/vesper/1.webp'] },
]
const ideas = [
  { id: 'fern', title: 'Botanical forearm', description: 'Fern along the arm', placement: 'forearm', status: 'idea',
    linkedArtists: ['mora'], images: [{ url: 'images/demo/mora/1.webp', note: 'frond spacing' }] },
]
const attending = { [EDITION]: ['mora'] }
const lineups = { [EDITION]: { entries: [{ name: 'Mora Vane', handle: 'mora.blackfern', note: 'No Regrets Studios, Booth 315A' }], updatedAt: '', cleared: false } }

const image = (s, type = 'image/jpeg') => new Blob([s], { type })
function reader(fail = {}) {
  return vi.fn(async (ref) => {
    const id = typeof ref === 'string' ? ref : ref.key
    if (fail[id]) return { error: fail[id] }
    return { blob: image(`bytes of ${id}`, 'image/webp') }
  })
}

let n = 0
let store
const ownerA = { ownerId: 'A', assertCurrent: () => {} }
const ownerB = { ownerId: 'B', assertCurrent: () => {} }

function renderRadar({ owner = ownerA, read = reader(), path = '/conventions', props = {} } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Conventions
        artists={artists}
        ideas={ideas}
        conventionOverrides={attending}
        conventionLineups={lineups}
        now={NOV_2026}
        packStore={store}
        getPackOwner={() => owner}
        readPackPhoto={read}
        packClock={() => '2026-11-26T14:02:00.000Z'}
        {...props}
      />
    </MemoryRouter>
  )
}

const hero = () => screen.getByRole('heading', { name: 'UK Tattoo Fest' }).closest('div.animate-slide-up')
const packToggle = () => within(hero()).getByRole('button', { name: /offline pack/i })

async function openPanel() {
  await waitFor(() => expect(packToggle()).not.toHaveTextContent(/loading/i))
  fireEvent.click(packToggle())
  // Opening a prepared pack re-reads its bytes first; wait for that check.
  await waitFor(() => expect(within(hero()).queryByRole('button', { name: 'Checking…' })).toBeNull())
}

async function preparedFor(owner = 'A', selection = { artistIds: ['mora'], ideaIds: ['fern'] }) {
  const plan = planShowPack({ edition: { editionKey: EDITION, label: 'UK Tattoo Fest 2027' }, artists, ideas, entries: lineups[EDITION].entries, selection })
  return preparePack(plan, { ownerId: owner, store, readPhoto: reader(), now: () => '2026-11-26T14:02:00.000Z' })
}

beforeEach(() => {
  store = createShowPackStore({ dbName: `show-pack-ui-test-${n++}` })
  URL.createObjectURL = vi.fn(() => `blob:pack-${Math.random()}`)
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.restoreAllMocks())

describe('Offline pack on a Radar card', () => {
  it('starts not prepared, with the attending artists and their linked ideas chosen', async () => {
    renderRadar()
    await waitFor(() => expect(packToggle()).toHaveTextContent(/not prepared/i))
    fireEvent.click(packToggle())
    const card = within(hero())
    expect(card.getByRole('button', { name: 'Mora Vane' })).toHaveAttribute('aria-pressed', 'true')
    expect(card.getByRole('button', { name: 'Botanical forearm' })).toHaveAttribute('aria-pressed', 'true')
    expect(card.getByText(/1 artist · 1 idea · 3 photos/)).toBeInTheDocument()
  })

  it('choosing an artist brings their linked ideas, and dropping them takes those ideas away', async () => {
    renderRadar({ props: { conventionOverrides: { [EDITION]: ['mora', 'vesper'] } } })
    await openPanel()
    const card = within(hero())
    fireEvent.click(card.getByRole('button', { name: 'Mora Vane' }))
    expect(card.queryByRole('button', { name: 'Botanical forearm' })).toBeNull()
    fireEvent.click(card.getByRole('button', { name: 'Mora Vane' }))
    expect(card.getByRole('button', { name: 'Botanical forearm' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('prepares the pack and reports ready only after reading the photos back, with when it checked', async () => {
    const read = reader()
    renderRadar({ read })
    await openPanel()
    fireEvent.click(within(hero()).getByRole('button', { name: 'Prepare pack' }))

    expect(await within(hero()).findByText(/Ready offline/)).toBeInTheDocument()
    expect(within(hero()).getByText(/checked 26 Nov/)).toBeInTheDocument()
    expect(within(hero()).getByText(/2 photos saved on this phone/)).toBeInTheDocument()
    expect(within(hero()).getByText(/1 photo is a link to another site/)).toBeInTheDocument()
    // Never the external photo.
    expect(read.mock.calls.map(([ref]) => ref)).not.toContain('https://cdn.example.com/x.jpg')
    expect(packToggle()).toHaveTextContent(/ready/i)
    expect((await store.getPack('A', EDITION)).state).toBe('done')
  })

  it('names what it could not save and offers a retry, never ready', async () => {
    renderRadar({ read: reader({ 'images/demo/mora/1.webp': 'offline' }) })
    await openPanel()
    fireEvent.click(within(hero()).getByRole('button', { name: 'Prepare pack' }))

    expect(await within(hero()).findByText(/Not ready · checked/)).toBeInTheDocument()
    expect(within(hero()).getByText(/Mora Vane, photo 2/)).toBeInTheDocument()
    expect(within(hero()).getByText(/no connection/i)).toBeInTheDocument()
    expect(within(hero()).queryByText(/Ready offline/)).toBeNull()
    expect(within(hero()).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('says a pack is out of date once the library changes', async () => {
    await preparedFor()
    const { rerender } = renderRadar()
    await openPanel()
    expect(await within(hero()).findByText(/Ready offline/)).toBeInTheDocument()
    const moved = artists.map((a) => (a.id === 'mora' ? { ...a, images: [...a.images, 'images/demo/mora/2.webp'] } : a))
    rerender(
      <MemoryRouter initialEntries={['/conventions']}>
        <Conventions artists={moved} ideas={ideas} conventionOverrides={attending} conventionLineups={lineups} now={NOV_2026}
          packStore={store} getPackOwner={() => ownerA} readPackPhoto={reader()} packClock={() => '2026-11-26T14:02:00.000Z'} />
      </MemoryRouter>
    )
    expect(within(hero()).getByText(/Changed since you prepared it/)).toBeInTheDocument()
    expect(within(hero()).getByRole('button', { name: 'Refresh pack' })).toBeInTheDocument()
  })

  it('a chip tapped on a ready pack is not saved until a refresh, and can be undone', async () => {
    await preparedFor()
    renderRadar({ props: { conventionOverrides: { [EDITION]: ['mora', 'vesper'] } } })
    await openPanel()
    const card = within(hero())
    expect(await card.findByText(/Ready offline/)).toBeInTheDocument()
    // Ready and current: Open is the one primary action, above the choices.
    const buttons = card.getAllByRole('button').map((b) => b.textContent)
    expect(buttons.indexOf('Open pack')).toBeLessThan(buttons.indexOf('Vesper Ash'))

    fireEvent.click(card.getByRole('button', { name: 'Vesper Ash' }))
    expect(card.getByText(/Not saved to the pack yet/)).toBeInTheDocument()
    expect(card.queryByText(/Changed since you prepared it/)).toBeNull()
    fireEvent.click(card.getByRole('button', { name: 'Undo' }))
    expect(card.queryByText(/Not saved to the pack yet/)).toBeNull()
    expect(card.getByRole('button', { name: 'Vesper Ash' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('removes only the pack, after asking', async () => {
    await preparedFor()
    renderRadar()
    await openPanel()
    const card = within(hero())
    fireEvent.click(await card.findByRole('button', { name: 'Remove pack' }))
    expect(card.getByText(/Your artists, ideas and photos stay as they are/)).toBeInTheDocument()
    // The safe choice comes first.
    const confirmButtons = card.getAllByRole('button').map((b) => b.textContent)
    expect(confirmButtons.indexOf('Cancel')).toBeLessThan(confirmButtons.indexOf('Remove'))
    fireEvent.click(card.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(packToggle()).toHaveTextContent(/not prepared/i))
    expect(await store.listPacks('A')).toEqual([])
    expect(await store.listPhotoIds('A')).toEqual([])
  })

  it('shows the next account on this phone none of the previous account’s pack', async () => {
    await preparedFor('A')
    renderRadar({ owner: ownerB, path: `/conventions?pack=${encodeURIComponent(EDITION)}` })
    expect(await screen.findByText(/No offline pack for this show on this phone/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    await waitFor(() => expect(packToggle()).toHaveTextContent(/not prepared/i))
    expect(screen.queryByText('Botanical forearm')).toBeNull()
  })

  it('has nothing to offer a show nobody is marked going to', async () => {
    renderRadar({ props: { conventionOverrides: {}, conventionLineups: {} } })
    await openPanel()
    expect(within(hero()).getByText(/Mark who.s going first/)).toBeInTheDocument()
    expect(within(hero()).queryByRole('button', { name: 'Prepare pack' })).toBeNull()
  })
})

describe('Opening a pack', () => {
  async function openViewer(owner = ownerA) {
    renderRadar({ owner, path: `/conventions?pack=${encodeURIComponent(EDITION)}` })
    return screen.findByRole('dialog', { name: /UK Tattoo Fest 2027/ })
  }

  it('shows the artists with their booth note, the ideas, and photos from the copies on this phone', async () => {
    await preparedFor()
    const dialog = within(await openViewer())

    expect(dialog.getByRole('heading', { name: 'Mora Vane' })).toBeInTheDocument()
    expect(dialog.getByText('Booth 315A')).toBeInTheDocument()
    expect(dialog.getByText(/No Regrets Studios/)).toBeInTheDocument()
    expect(dialog.getByRole('heading', { name: 'Botanical forearm' })).toBeInTheDocument()
    expect(dialog.getByText('Fern along the arm')).toBeInTheDocument()
    expect(dialog.getByText('frond spacing')).toBeInTheDocument()
    await waitFor(() => expect(dialog.getAllByRole('img').filter((img) => img.getAttribute('src')?.startsWith('blob:'))).toHaveLength(3))
    expect(dialog.getByRole('img', { name: /on another site/i })).toBeInTheDocument()
    expect(dialog.getByText(/Ready offline/)).toBeInTheDocument()
  })

  it('marks a photo that is no longer on this phone instead of showing a broken image', async () => {
    await preparedFor()
    await store.deletePhotos('A', ['path:/images/demo/mora/1.webp'])
    const dialog = within(await openViewer())
    await waitFor(() => expect(dialog.getAllByRole('img', { name: /not on this phone/i })).toHaveLength(2))
  })

  // Review finding (codex): opened straight from a link, the viewer showed
  // the last check's "Ready" over a photo that had since gone or changed.
  it('re-reads the bytes on open: a photo changed since the last check is not shown and the pack is not ready', async () => {
    await preparedFor()
    const record = await store.getPhoto('A', `key:${KEY}`)
    const same = new Uint8Array(record.bytes.byteLength).fill(120)
    await store.putPhoto({ ...record, bytes: same.buffer })
    const dialog = within(await openViewer())

    expect(await dialog.findByText(/Not ready/)).toBeInTheDocument()
    expect(dialog.queryByText(/Ready offline/)).toBeNull()
    expect(dialog.getByRole('img', { name: /Mora Vane, photo 1: copy damaged/ })).toBeInTheDocument()
    expect((await store.getPack('A', EDITION)).verification.damaged).toEqual([`key:${KEY}`])
  })

  it('opens a photo full size; Escape closes the photo first, then the pack', async () => {
    await preparedFor()
    const dialog = within(await openViewer())
    const open = await dialog.findAllByRole('button', { name: /open mora vane, photo/i })
    fireEvent.click(open[0])
    expect(screen.getByRole('dialog', { name: 'Mora Vane, photo 1' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Mora Vane, photo 1' })).toBeNull()
    expect(screen.getByRole('dialog', { name: /UK Tattoo Fest 2027/ })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /UK Tattoo Fest 2027/ })).toBeNull())
  })

  it('frees the photo copies it made when it closes', async () => {
    await preparedFor()
    const dialog = within(await openViewer())
    // One copy per stored photo, even where an artist and an idea share it.
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2))
    fireEvent.click(dialog.getByRole('button', { name: /close/i }))
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2))
  })
})
