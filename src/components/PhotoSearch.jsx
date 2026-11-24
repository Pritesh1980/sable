import { useEffect, useMemo, useRef, useState } from 'react'
import ArtistImage from './ArtistImage'
import useDialogFocus, { isTopmostDialog } from '../hooks/useDialogFocus'
import useStyleVectors from '../hooks/useStyleVectors'
import { textVectorFor } from '../data/styleIndex'
import { normaliseQuery, searchPhotosByText, groupByArtist, TEXT_RESULT_LIMIT } from '../data/textSearch'
import { buildWallItems } from '../data/wall'
import { refIdentity } from '../data/imageRef'

const BUTTON = 'min-h-11 flex items-center justify-center bg-v2-ink border border-v2-hairline hover:border-v2-accent rounded-xs px-4 py-2 text-v2-cream font-v2-ui text-sm transition-colors'
const NOTE = 'font-v2-ui text-sm text-v2-muted leading-relaxed'
const ONE_SUBJECT = 'Search works best with one subject, like skull, wolf or a woman’s face.'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Search your photos by words (#186), on this device. CLIP's text half puts the
// phrase in the style index's space; nothing leaves the phone. The sheet sits
// under the photo viewer, so Back from a photo comes back to these results.
//
// `query` is the searched phrase from the address (?search=…), the source of
// truth: a reload, Back or Forward that changes it searches again, but only
// from a kept phrase. Only a tap may start the 67 MB model download.
export default function PhotoSearch({ artists, saved, query = '', onQueryChange, onClose, onOpenItem, search = textVectorFor }) {
  const dialogRef = useDialogFocus(true)
  const inputRef = useRef(null)
  const { vectors, getVec, coverage, progress, error: indexError, build } = useStyleVectors(artists, saved)
  const [text, setText] = useState(query)
  // idle → loading → done | error, for the phrase in `state.query`.
  const [state, setState] = useState({ status: 'idle' })
  const latest = useRef({ ticket: 0, query: null })

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (!isTopmostDialog(dialogRef.current)) return
      e.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, dialogRef])

  async function run(phrase, { cachedOnly = false } = {}) {
    const ticket = ++latest.current.ticket
    latest.current.query = phrase
    const current = () => ticket === latest.current.ticket
    setState({ status: 'loading', query: phrase, percent: null })
    try {
      const vec = await search(phrase, {
        cachedOnly,
        onProgress: (percent) => current() && setState((s) => (s.status === 'loading' ? { ...s, percent } : s)),
      })
      if (!current()) return
      // A restored phrase that was never kept waits for a tap.
      setState(vec ? { status: 'done', query: phrase, vec } : { status: 'idle' })
    } catch (err) {
      console.error('[tattoo] text search failed:', err)
      if (current()) setState({ status: 'error', query: phrase })
    }
  }

  // The address changed under the sheet (opened from a link, a reload, Back or
  // Forward): show that phrase. A tapped search already ran it.
  const restored = normaliseQuery(query)
  useEffect(() => {
    if (!restored || restored === latest.current.query) return
    setText(restored)
    void run(restored, { cachedOnly: true })
    // `run` is recreated each render; the phrase is what matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored])

  function submit(e) {
    e.preventDefault()
    const phrase = normaliseQuery(text)
    if (!phrase) return
    void run(phrase)
    onQueryChange?.(phrase)
  }

  const indexed = Boolean(coverage && coverage.embedded > 0)

  // The box appears once the index has been read: put the cursor in it.
  useEffect(() => {
    if (indexed) inputRef.current?.focus({ preventScroll: true })
  }, [indexed])

  const { groups, capped } = useMemo(() => {
    if (state.status !== 'done' || !getVec) return { groups: [], capped: false }
    const matches = searchPhotosByText(state.vec, buildWallItems(artists, { saved }), getVec, { limit: TEXT_RESULT_LIMIT + 1 })
    return { groups: groupByArtist(matches.slice(0, TEXT_RESULT_LIMIT)), capped: matches.length > TEXT_RESULT_LIMIT }
  }, [state, getVec, artists, saved])

  const indexing = progress && (
    <p role="status" className="font-v2-ui text-sm text-v2-cream mb-5">
      Indexing… {progress.done}/{progress.total}
      <span className="block text-v2-muted mt-1">The first run downloads the model.</span>
    </p>
  )
  const indexAlert = indexError && <p role="alert" className="font-v2-ui text-sm text-v2-accent mt-3">{indexError}</p>

  let results
  if (state.status === 'idle') {
    results = (
      <p className={NOTE}>
        {ONE_SUBJECT} The first search on this device downloads a 67 MB model, once. Your photos never leave it.
      </p>
    )
  } else if (state.status === 'loading') {
    results = (
      <p role="status" className="font-v2-ui text-sm text-v2-cream">
        {state.percent == null ? 'Searching…' : `Loading the search model… ${state.percent}%`}
      </p>
    )
  } else if (state.status === 'error') {
    results = (
      <p role="alert" className="font-v2-ui text-sm text-v2-accent">
        Could not load the search model. Check your connection and try again.
      </p>
    )
  } else if (groups.length === 0) {
    results = (
      <div>
        <p className="font-v2-ui text-sm text-v2-cream mb-2">Nothing in your photos looks like “{state.query}”.</p>
        <p className={NOTE}>{ONE_SUBJECT}</p>
      </div>
    )
  } else {
    results = (
      <div className="flex flex-col gap-7">
        {groups.map((group, g) => (
          <section key={group.key} aria-labelledby={`search-group-${g}`}>
            <h3 id={`search-group-${g}`} className="font-v2-display text-sm tracking-[0.16em] uppercase text-v2-cream mb-2 truncate">
              {group.artistId ? group.artistName : 'Saved photos'}
            </h3>
            <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
              {group.matches.map(({ item }, n) => (
                <li key={refIdentity(item.image)}>
                  <button
                    type="button"
                    aria-label={`Open photo ${n + 1} ${group.artistId ? `by ${group.artistName}` : 'saved with no artist'}`}
                    onClick={() => onOpenItem(item)}
                    className="block w-full aspect-square overflow-hidden bg-v2-surface outline-hidden focus-visible:ring-2 focus-visible:ring-v2-accent"
                  >
                    <ArtistImage
                      src={item.image}
                      label={item.artistName}
                      sizes="(max-width: 640px) 33vw, 16vw"
                      className="w-full h-full object-cover"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {capped && <p className={NOTE}>Showing the best {TEXT_RESULT_LIMIT} matches.</p>}
      </div>
    )
  }

  let body = null // nothing until the index has been read
  if (vectors !== null && !indexed) {
    body = indexing || (
      <div>
        <p className="font-v2-ui text-sm text-v2-cream leading-relaxed mb-4">
          Search needs the style index. It is built on this device, with a one-off model download, and your photos never leave it.
        </p>
        <button type="button" onClick={build} className={BUTTON}>Build style index</button>
        {indexAlert}
      </div>
    )
  } else if (indexed) {
    body = (
      <>
        <form role="search" onSubmit={submit} className="flex gap-2 mb-2">
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            aria-label="Search your photos"
            placeholder="skull, wolf, a face"
            value={text}
            onChange={(e) => setText(e.target.value)}
            // 16px stops iOS zooming into the field.
            className="min-w-0 flex-1 min-h-11 px-3 bg-v2-surface border border-v2-hairline focus:border-v2-accent rounded-xs text-v2-cream font-v2-ui text-base outline-hidden"
          />
          <button type="submit" className={BUTTON}>Search</button>
        </form>
        {indexing || (
          <p className="font-v2-ui text-xs text-v2-muted mb-5">
            Searching {coverage.embedded} of {plural(coverage.total, 'photo')}
          </p>
        )}
        {results}
        {!progress && coverage.embedded < coverage.total && (
          <button type="button" onClick={build} className={`${BUTTON} mt-6`}>
            Update style index ({plural(coverage.total - coverage.embedded, 'new photo')})
          </button>
        )}
        {indexAlert}
      </>
    )
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Search your photos"
      tabIndex={-1}
      className="fixed inset-0 z-[55] bg-v2-ink flex flex-col focus:outline-hidden animate-slide-up"
    >
      <div className="flex items-center justify-between gap-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] border-b border-v2-hairline">
        <h2 className="font-v2-display text-lg tracking-[0.2em] uppercase text-v2-cream">Search</h2>
        <button type="button" onClick={onClose} aria-label="Close search" className={`${BUTTON} tracking-widest uppercase text-xs`}>
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto pt-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {body}
      </div>
    </div>
  )
}
