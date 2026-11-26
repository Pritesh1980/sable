import { useEffect, useId, useState } from 'react'
import useDialogFocus, { useEscapeToClose } from '../hooks/useDialogFocus'
import { formatPackTime, lineupDetail, packStatus } from '../data/showPack'
import { verifyPack } from '../data/showPackPrepare'

// An offline show pack, opened (#209). Everything here comes from the pack
// store on this phone: the text from the pack's snapshot, the photos from the
// copies saved beside it. Nothing is fetched, so it works in a hall with no
// signal. A photo that isn't on the phone says so; one on another site was
// never saved and says that instead.

const STATE_LINE = {
  ready: 'Ready offline',
  incomplete: 'Not ready: some photos aren’t on this phone',
  interrupted: 'Interrupted: some photos may be missing',
  preparing: 'Still saving',
}

// Opening a pack re-reads its stored bytes first (the same check as Check
// again), so what it claims is about the phone now, not the last check. Only
// photos that pass get shown; the rest say why not.
function useCheckedPack(pack, owner, store, clock) {
  const [state, setState] = useState({ for: null, checked: null, urls: new Map() })
  useEffect(() => {
    if (!pack || !owner || !store) return undefined
    let live = true
    const made = []
    ;(async () => {
      let checked
      try {
        checked = await verifyPack(pack, { store, assertCurrent: owner.assertCurrent, ...(clock ? { now: clock } : {}) })
      } catch {
        checked = { ...pack, verification: null }
      }
      const present = new Set(checked.verification?.present || [])
      const urls = new Map()
      for (const photo of pack.photos) {
        if (!present.has(photo.id)) continue
        try {
          const record = await store.getPhoto(owner.ownerId, photo.id)
          if (!live) return
          if (record?.bytes?.byteLength) {
            const url = URL.createObjectURL(new Blob([record.bytes], { type: record.type }))
            made.push(url)
            urls.set(photo.id, url)
          }
        } catch { /* shown as not on this phone */ }
      }
      if (live) setState({ for: pack, checked, urls })
    })()
    return () => {
      live = false
      for (const url of made) URL.revokeObjectURL(url)
    }
  }, [pack, owner, store, clock])
  return state.for === pack ? state : null
}

function Tile({ photo, src, damaged = false, label, onOpen }) {
  const box = 'aspect-square w-full rounded-xs overflow-hidden bg-ink-muted'
  if (photo?.external) {
    return (
      <div role="img" aria-label={`${label}: on another site, not saved`} className={`${box} flex items-center justify-center p-2 text-center`}>
        <span className="text-[0.625rem] font-mono tracking-widest uppercase text-cream-muted/90">On another site</span>
      </div>
    )
  }
  if (src === undefined) return <div aria-busy="true" aria-label={`${label}: checking`} className={box} />
  if (!src) {
    const text = damaged ? 'Copy damaged' : 'Not on this phone'
    return (
      <div role="img" aria-label={`${label}: ${text.toLowerCase()}`} className={`${box} flex items-center justify-center p-2 text-center`}>
        <span className="text-[0.625rem] font-mono tracking-widest uppercase text-cream-muted/90">{text}</span>
      </div>
    )
  }
  return (
    <button type="button" onClick={() => onOpen({ src, label })} aria-label={`Open ${label}`} className={`${box} block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}>
      <img src={src} alt={label} className="w-full h-full object-cover" />
    </button>
  )
}

function Photos({ ids, byId, urls, damaged, labelFor, notes = [], onOpen }) {
  if (!ids.length) return <p className="text-xs font-mono text-cream-muted/80 mt-2">No photos.</p>
  return (
    <ul className="grid grid-cols-2 gap-2 mt-3">
      {ids.map((id, i) => {
        const label = labelFor(i)
        return (
          <li key={`${id}-${i}`}>
            <Tile photo={byId.get(id)} src={urls ? urls.get(id) || '' : undefined} damaged={damaged.has(id)} label={label} onOpen={onOpen} />
            {notes[i] && <p className="text-[0.6875rem] font-body text-cream-muted/90 mt-1">{notes[i]}</p>}
          </li>
        )
      })}
    </ul>
  )
}

function Lightbox({ photo, onClose }) {
  const focusRef = useDialogFocus(true)
  const escapeRef = useEscapeToClose(onClose)
  return (
    <div
      ref={(node) => { focusRef.current = node; escapeRef.current = node }}
      role="dialog" aria-modal="true" aria-label={photo.label} tabIndex={-1}
      className="fixed inset-0 z-[90] flex flex-col bg-ink-black outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cream-muted"
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-safe-top">
        <p className="text-xs font-mono text-cream-muted/90 truncate py-3">{photo.label}</p>
        <button type="button" onClick={onClose} className="min-h-11 min-w-11 px-2 text-sm font-body text-cream-muted hover:text-cream">Close</button>
      </div>
      {/* Tap anywhere to close: one-handed, the corner button is a stretch. */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center p-2">
        <button type="button" onClick={onClose} aria-label="Close photo" className="absolute inset-0 w-full h-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" />
        <img src={photo.src} alt={photo.label} className="relative pointer-events-none max-w-full max-h-full object-contain" />
      </div>
    </div>
  )
}

export default function ShowPackViewer({ pack = null, loaded = true, owner = null, store, clock, onClose }) {
  const focusRef = useDialogFocus(true)
  const escapeRef = useEscapeToClose(onClose)
  const titleId = useId()
  const opened = useCheckedPack(pack, owner, store, clock)
  const urls = opened?.urls || null
  const damaged = new Set(opened?.checked?.verification?.damaged || [])
  const [zoomed, setZoomed] = useState(null)
  const byId = new Map((pack?.photos || []).map((p) => [p.id, p]))
  const status = opened ? packStatus(opened.checked) : null
  const names = new Map((pack?.artists || []).map((a) => [a.id, a.label]))
  const anchor = (kind, id) => `${titleId}-${kind}-${id}`.replace(/[^\w-]/g, '_')
  const jumps = [
    ...(pack?.artists || []).map((a) => ({ id: anchor('artist', a.id), label: a.booth ? `${a.label} · ${a.booth}` : a.label })),
    ...(pack?.ideas?.length ? [{ id: anchor('ideas', 'all'), label: 'Ideas' }] : []),
  ]

  return (
    <div
      ref={(node) => { focusRef.current = node; escapeRef.current = node }}
      role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
      className="fixed inset-0 z-[80] overflow-y-auto bg-ink-black text-cream outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cream-muted"
    >
      <header className="sticky top-0 z-10 border-b border-ink-border bg-ink-black px-4 pt-safe-top">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="text-[0.625rem] font-mono text-accent tracking-[0.3em] uppercase">Offline pack</p>
            <h2 id={titleId} className="font-display text-xl leading-tight truncate">{pack?.edition?.label || 'Offline pack'}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close offline pack" className="min-h-11 min-w-11 px-2 text-sm font-body text-cream-muted hover:text-cream shrink-0">Close</button>
        </div>
        {jumps.length > 1 && (
          // Straight to an artist (or the ideas) without scrolling past everyone else.
          <nav aria-label="Jump to" className="mx-auto max-w-3xl pb-2 overflow-x-auto">
            <ul className="flex gap-1.5 w-max">
              {jumps.map((jump) => (
                <li key={jump.id}>
                  <button
                    type="button"
                    onClick={() => globalThis.document?.getElementById(jump.id)?.scrollIntoView({ block: 'start' })}
                    className="min-h-11 px-3 rounded-xs border border-ink-border text-[0.6875rem] font-mono text-cream-muted tracking-wide whitespace-nowrap hover:text-cream hover:border-cream-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {jump.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-24">
        {!loaded && <p className="text-sm font-body text-cream-muted mt-6">Opening…</p>}
        {loaded && !pack && (
          <p className="text-sm font-body text-cream-muted mt-6">No offline pack for this show on this phone. Prepare one from the show’s card on Radar.</p>
        )}
        {pack && (
          <>
            <p className="text-xs font-mono text-cream-muted/90 mt-4">
              {[pack.edition?.dates, pack.edition?.location].filter(Boolean).join(' · ')}
            </p>
            <p role="status" className={`text-xs font-mono mt-1 ${status?.state === 'ready' ? 'text-accent' : 'text-cream'}`}>
              {status
                ? `${STATE_LINE[status.state] || ''}${status.checkedAt ? ` · checked ${formatPackTime(status.checkedAt)}` : ''}`
                : 'Checking the photos on this phone…'}
            </p>

            <section aria-labelledby={`${titleId}-artists`} className="mt-6">
              <h3 id={`${titleId}-artists`} className="text-[0.625rem] font-mono text-cream-muted tracking-widest uppercase">Artists</h3>
              {pack.artists.length === 0 && <p className="text-xs font-mono text-cream-muted/80 mt-2">No artists in this pack.</p>}
              {pack.artists.map((artist) => (
                <article key={artist.id} id={anchor('artist', artist.id)} className="border-t border-ink-border pt-4 mt-4 scroll-mt-36">
                  <h4 className="font-display text-2xl text-cream leading-tight">{artist.label}</h4>
                  <p className="text-xs font-mono text-cream-muted/90 mt-1">
                    {[artist.handle && `@${artist.handle}`, artist.rank && `#${artist.rank} in your ranking`].filter(Boolean).join(' · ')}
                  </p>
                  <p className={`text-sm font-mono mt-2 ${artist.booth ? 'text-accent' : 'text-cream-muted/90'}`}>
                    {artist.booth ? `Booth ${artist.booth}` : 'No booth in the line-up'}
                    {lineupDetail(artist.lineupNote) && (
                      <span className="text-cream-muted/90"> · {lineupDetail(artist.lineupNote)}</span>
                    )}
                  </p>
                  {artist.studio && <p className="text-xs font-mono text-cream-muted/90 mt-1">{artist.studio}</p>}
                  {artist.tags.length > 0 && <p className="text-[0.6875rem] font-mono text-cream-muted/90 tracking-wide mt-1">{artist.tags.join(' · ')}</p>}
                  {artist.styleNote && <p className="text-sm font-body text-cream-muted leading-relaxed mt-2">{artist.styleNote}</p>}
                  {artist.notes && <p className="text-sm font-body text-cream leading-relaxed mt-2">{artist.notes}</p>}
                  <Photos ids={artist.photos} byId={byId} urls={urls} damaged={damaged} labelFor={(i) => `${artist.label}, photo ${i + 1}`} onOpen={setZoomed} />
                </article>
              ))}
            </section>

            {pack.ideas.length > 0 && (
              <section id={anchor('ideas', 'all')} aria-labelledby={`${titleId}-ideas`} className="mt-8 scroll-mt-36">
                <h3 id={`${titleId}-ideas`} className="text-[0.625rem] font-mono text-cream-muted tracking-widest uppercase">Ideas</h3>
                {pack.ideas.map((idea) => (
                  <article key={idea.id} className="border-t border-ink-border pt-4 mt-4">
                    <h4 className="font-display text-xl text-cream leading-tight">{idea.title}</h4>
                    <p className="text-xs font-mono text-cream-muted/90 mt-1">
                      {[idea.placement, idea.artistIds.length > 0 && `For ${idea.artistIds.map((id) => names.get(id)).join(', ')}`].filter(Boolean).join(' · ')}
                    </p>
                    {idea.description && <p className="text-sm font-body text-cream-muted leading-relaxed mt-2">{idea.description}</p>}
                    <Photos
                      ids={idea.photos.map((p) => p.id)} notes={idea.photos.map((p) => p.note)} byId={byId} urls={urls} damaged={damaged}
                      labelFor={(i) => `${idea.title}, photo ${i + 1}`} onOpen={setZoomed}
                    />
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </div>
      {zoomed && <Lightbox photo={zoomed} onClose={() => setZoomed(null)} />}
    </div>
  )
}
