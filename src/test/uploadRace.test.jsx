import { useState } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// #75. Every upload path built the new list from a snapshot taken when the
// picker closed:
//
//   onSaveImages(artist, [...(artist.images || []), ...uploaded])
//
// The store write is a functional update, but the *value* it writes is stale.
// Start a second batch before the first resolves and whichever lands last
// overwrites the other, silently losing those photos.
//
// Each test models the store the way Gallery does — apply an array or an
// updater to the latest value — so the assertion is about what the user ends up
// with, not about which shape the component happened to pass.

// One deferred upload per call, resolved by the test in whatever order it likes.
const pending = []
vi.mock('../hooks/useImageUpload', () => ({
  uploadImages: vi.fn(
    (files) =>
      new Promise((resolve) => {
        pending.push({ resolve, count: files.length })
      })
  ),
  compressImages: vi.fn(async () => []),
}))

const { default: ArtistCard } = await import('../components/ArtistCard')
const { default: ArtistTable } = await import('../components/ArtistTable')
const { default: ArtistDetail } = await import('../components/ArtistDetail')
const { default: Gallery } = await import('../pages/Gallery')

// The newest artists array the Gallery harness rendered.
let lastArtists = []

const artist = {
  id: 'a1',
  handle: 'zoia.ink',
  name: 'Zoia',
  rank: 1,
  images: ['first.jpg'],
  tags: [],
  status: 'researching',
  notes: '',
  studio: null,
  generation: 'g-fixed',
}

// A store that behaves like Gallery's setArtists: the updater form always sees
// the newest value.
function makeStore(initial) {
  let images = initial
  return {
    get: () => images,
    apply: (next) => {
      images = typeof next === 'function' ? next(images) : next
    },
  }
}

function filesNamed(...names) {
  return names.map((n) => new File(['x'], n, { type: 'image/jpeg' }))
}

// Two batches in flight, second resolving first — the order that hides the bug
// behind whichever write happens to land last.
async function raceTwoBatches(input, store) {
  fireEvent.change(input, { target: { files: filesNamed('a.jpg', 'b.jpg') } })
  await waitFor(() => expect(pending).toHaveLength(1))
  fireEvent.change(input, { target: { files: filesNamed('c.jpg') } })
  await waitFor(() => expect(pending).toHaveLength(2))

  pending[1].resolve(['c-up.jpg'])
  await waitFor(() => expect(store.get().length).toBeGreaterThan(1))
  pending[0].resolve(['a-up.jpg', 'b-up.jpg'])
  await waitFor(() => expect(store.get().length).toBeGreaterThan(2))
}

beforeEach(() => {
  pending.length = 0
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('two upload batches in flight, grid card (#75)', () => {
  it('keeps every photo from both batches', async () => {
    const store = makeStore(['first.jpg'])
    render(
      <ArtistCard
        artist={artist}
        onOpen={() => {}}
        onSaveImages={(_a, next) => store.apply(next)}
        editing
      />
    )

    await raceTwoBatches(document.querySelector('input[type="file"]'), store)

    expect(store.get()).toEqual(
      expect.arrayContaining(['first.jpg', 'a-up.jpg', 'b-up.jpg', 'c-up.jpg'])
    )
    expect(store.get()).toHaveLength(4)
  })
})

describe('two upload batches in flight, Manage table (#75)', () => {
  it('keeps every photo from both batches', async () => {
    const store = makeStore(['first.jpg'])
    render(
      <ArtistTable
        artists={[artist]}
        onSaveImages={(_id, next) => store.apply(next)}
        onUpdate={() => {}}
        onRemove={() => {}}
      />
    )
    // The upload control lives in the expanded row; the whole row toggles it.
    fireEvent.click(screen.getByText('Zoia').closest('tr'))

    await raceTwoBatches(document.querySelector('input[type="file"]'), store)

    expect(store.get()).toEqual(
      expect.arrayContaining(['first.jpg', 'a-up.jpg', 'b-up.jpg', 'c-up.jpg'])
    )
    expect(store.get()).toHaveLength(4)
  })
})

// codex review: the three tests above swap in a fake adapter for onSaveImages,
// so they never exercise Gallery's forwarding layer. Reverting `saveImages` to
// the old array-only version would store the updater *function* as
// `artist.images` in production while all of them stayed green.
describe('the grid upload through the real Gallery wrapper (#75)', () => {
  function Harness() {
    const [artists, setArtists] = useState([artist])
    lastArtists = artists
    return (
      <MemoryRouter initialEntries={['/gallery']}>
        <Gallery artists={artists} setArtists={setArtists} />
      </MemoryRouter>
    )
  }

  it('stores an array of images, not the updater it was handed', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByTitle('Grid view'))
    fireEvent.click(screen.getByRole('button', { name: /reorder/i }))

    fireEvent.change(document.querySelector('input[type="file"]'), {
      target: { files: filesNamed('a.jpg') },
    })
    await waitFor(() => expect(pending).toHaveLength(1))
    pending[0].resolve(['a-up.jpg'])

    await waitFor(() => expect(lastArtists[0].images).toHaveLength(2))
    expect(Array.isArray(lastArtists[0].images)).toBe(true)
    expect(lastArtists[0].images).toEqual(['first.jpg', 'a-up.jpg'])
  })
})

describe('two upload batches in flight, artist detail (#75)', () => {
  it('keeps every photo from both batches', async () => {
    const store = makeStore(['first.jpg'])
    render(
      <ArtistDetail
        artist={artist}
        onClose={() => {}}
        // onSave is now (id, generation, patchOrUpdater) (#79, #80) rather
        // than a whole record; resolve it against the latest known record
        // the same way Gallery.saveArtist does, then keep only what this
        // store tracks.
        onSave={(id, generation, patchOrUpdater) => {
          const currentRecord = { ...artist, images: store.get() }
          const next =
            typeof patchOrUpdater === 'function'
              ? patchOrUpdater(currentRecord)
              : { ...currentRecord, ...patchOrUpdater }
          store.apply(next.images)
        }}
      />
    )

    await raceTwoBatches(document.querySelector('input[type="file"]'), store)

    expect(store.get()).toEqual(
      expect.arrayContaining(['first.jpg', 'a-up.jpg', 'b-up.jpg', 'c-up.jpg'])
    )
    expect(store.get()).toHaveLength(4)
  })
})
