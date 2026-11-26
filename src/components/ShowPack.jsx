import { useEffect, useMemo, useRef, useState } from 'react'
import {
  defaultPackSelection, formatBytes, formatPackTime, linkedIdeas, packArtistChoices, packFreshness, packStatus, photoPlaces, planShowPack,
} from '../data/showPack'
import { isQuotaError, preparePack, removePack, verifyPack } from '../data/showPackPrepare'
import { getStoragePersistence } from '../data/storagePersistence'

// Radar → a show's card → Offline pack (#209). Choose the artists you mean to
// see and the ideas linked to them, save them on this phone, and open them in
// a hall with no signal. The rules about what "ready" means live in
// src/data/showPackPrepare.js; this panel only reports what the store says.

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const sameIds = (a = [], b = []) => a.length === b.length && a.every((id) => b.includes(id))
const sameSelection = (a, b) => sameIds(a?.artistIds, b?.artistIds) && sameIds(a?.ideaIds, b?.ideaIds)

const HEADER = {
  none: 'Not prepared',
  preparing: 'Saving…',
  interrupted: 'Interrupted',
  incomplete: 'Not ready',
  ready: 'Ready',
}

const WHY = {
  offline: 'no connection',
  partial: 'download cut short',
  unavailable: 'couldn’t be read',
  quota: 'storage full',
  skipped: 'not tried: storage full',
  missing: 'no longer on this phone',
  damaged: 'changed on this phone',
}

const REASON = {
  offline: 'Some photos couldn’t be downloaded, probably for want of a connection. Try again with signal.',
  quota: 'This phone’s storage for Sable is full, so the pack stopped. Free some space, or choose fewer artists, then try again.',
  lost: 'Some photos saved earlier are no longer on this phone (the browser may have cleared them). Try again with signal.',
  unavailable: 'Some photos couldn’t be read. Try again with signal; if they still fail, they may have gone from the library.',
  unchecked: 'This pack hasn’t been checked yet. Tap Check again.',
}

const primaryClass = 'inline-flex items-center min-h-11 px-3 text-[0.6875rem] font-mono text-accent tracking-widest uppercase border border-accent/40 rounded-xs hover:border-accent hover:text-accent-hover transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
const secondaryClass = 'inline-flex items-center min-h-11 px-3 text-[0.625rem] font-mono text-cream-muted tracking-widest uppercase hover:text-cream transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
const neutralClass = 'inline-flex items-center min-h-11 px-3 text-[0.6875rem] font-mono text-cream tracking-widest uppercase border border-ink-border rounded-xs hover:border-cream-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
const chipClass = (on) => `min-h-11 px-3 rounded-xs border text-[0.6875rem] font-mono tracking-wide text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
  on ? 'border-accent bg-accent/10 text-accent' : 'border-ink-border text-cream-muted hover:border-cream-muted hover:text-cream'
}`

function Chips({ label, items, selected, onToggle }) {
  return (
    <fieldset className="mt-3">
      <legend className="text-[0.625rem] font-mono text-cream-muted/80 tracking-widest uppercase">{label}</legend>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {items.map((item) => (
          <button key={item.id} type="button" aria-pressed={selected.includes(item.id)} onClick={() => onToggle(item.id)} className={chipClass(selected.includes(item.id))}>
            {item.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function Progress({ progress, onStop }) {
  return (
    <div className="mt-3">
      <div role="progressbar" aria-label="Saving the pack" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} className="h-1 bg-ink-muted rounded-xs overflow-hidden">
        <div className="h-full bg-accent transition-[width]" style={{ width: `${progress.total ? (100 * progress.done) / progress.total : 0}%` }} />
      </div>
      <div className="flex items-center justify-between gap-3 mt-1">
        <p className="text-xs font-mono text-cream-muted/90">Saving photo {Math.min(progress.done + 1, progress.total)} of {progress.total}…</p>
        <button type="button" onClick={onStop} className={secondaryClass}>Stop</button>
      </div>
    </div>
  )
}

function Problems({ status, pack }) {
  const places = photoPlaces(pack)
  const shown = status.problems.slice(0, 4)
  return (
    <ul className="mt-1.5 space-y-0.5">
      {shown.map((p) => (
        <li key={p.id} className="text-xs font-mono text-cream-muted/90">
          {(places.get(p.id) || ['A photo'])[0]}: {WHY[p.why] || 'not saved'}
        </li>
      ))}
      {status.problems.length > shown.length && (
        <li className="text-xs font-mono text-cream-muted/80">and {plural(status.problems.length - shown.length, 'more photo')}</li>
      )}
    </ul>
  )
}

function StatusBlock({ status, pack, stale }) {
  if (status.state === 'none' || status.state === 'preparing') return null
  const checked = status.checkedAt ? ` · checked ${formatPackTime(status.checkedAt)}` : ''
  return (
    <div className="mt-3 border-l-2 border-ink-border pl-3" role="status">
      {status.state === 'ready' && (
        <>
          <p className="text-sm font-body text-cream"><span className="text-accent" aria-hidden="true">✓ </span>Ready offline{checked}</p>
          <p className="text-xs font-mono text-cream-muted/90 mt-0.5">
            {plural(status.saved, 'photo')} saved on this phone{status.bytes ? ` (${formatBytes(status.bytes)})` : ''}.
          </p>
        </>
      )}
      {status.state === 'interrupted' && (
        <>
          <p className="text-sm font-body text-cream">Interrupted{checked}</p>
          <p className="text-xs font-mono text-cream-muted/90 mt-0.5">
            It stopped before it finished{status.checkedAt ? `, with ${status.saved} of ${plural(status.savable, 'photo')} saved` : ''}. Resume to finish; nothing saved is lost.
          </p>
        </>
      )}
      {status.state === 'incomplete' && (
        <>
          <p className="text-sm font-body text-cream">Not ready{checked}</p>
          <p className="text-xs font-mono text-cream-muted/90 mt-0.5">{status.saved} of {plural(status.savable, 'photo')} saved. {REASON[status.reason]}</p>
          <Problems status={status} pack={pack} />
        </>
      )}
      {status.external > 0 && (
        <p className="text-xs font-mono text-cream-muted/90 mt-0.5">
          {status.external === 1 ? '1 photo is a link to another site' : `${status.external} photos are links to other sites`}, so it can’t be saved for offline.
        </p>
      )}
      {stale && <p className="text-xs font-mono text-accent mt-1">Changed since you prepared it: refresh to bring the pack up to date.</p>}
    </div>
  )
}

export default function ShowPack({
  convention,
  artists = [],
  ideas = [],
  entries = [],
  attendingIds = [],
  studios = [],
  pack = null,
  loaded = true,
  owner = null,
  store,
  readPhoto,
  clock,
  onPackChange = () => {},
  onOpen = () => {},
}) {
  const [expanded, setExpanded] = useState(false)
  // Derived until touched: the pack's own choice once there is one, else who
  // is marked attending and the ideas linked to them.
  const [chosen, setChosen] = useState(null)
  const [phase, setPhase] = useState('idle') // idle | running | checking | removing
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const controller = useRef(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controller.current?.abort()
    }
  }, [])

  const selection = chosen ?? pack?.selection ?? defaultPackSelection({ artists, ideas, attendingIds })
  const choices = useMemo(
    () => packArtistChoices(artists, { attendingIds, entries, selectedIds: selection.artistIds }),
    [artists, attendingIds, entries, selection.artistIds]
  )
  const ideaChoices = useMemo(() => {
    const linked = linkedIdeas(ideas, selection.artistIds)
    const kept = ideas.filter((i) => selection.ideaIds.includes(i.id) && !linked.includes(i))
    return [...linked, ...kept].map((i) => ({ id: i.id, label: i.title?.trim() || 'Untitled idea' }))
  }, [ideas, selection.artistIds, selection.ideaIds])
  const plan = useMemo(
    () => planShowPack({ edition: convention, artists, ideas, entries, studios, selection }),
    [convention, artists, ideas, entries, studios, selection]
  )
  const running = phase === 'running'
  const status = packStatus(pack, { running })
  const stale = Boolean(pack) && pack.state === 'done' && packFreshness(pack, plan).stale
  const busy = phase !== 'idle'

  function toggleArtist(id) {
    const on = selection.artistIds.includes(id)
    const artistIds = on ? selection.artistIds.filter((a) => a !== id) : [...selection.artistIds, id]
    const stillLinked = new Set(linkedIdeas(ideas, artistIds).map((i) => i.id))
    const before = new Set(linkedIdeas(ideas, selection.artistIds).map((i) => i.id))
    const ideaIds = on
      // Ideas only this artist brought in go with them; ones you picked yourself stay.
      ? selection.ideaIds.filter((i) => stillLinked.has(i) || !before.has(i))
      : [...new Set([...selection.ideaIds, ...linkedIdeas(ideas, [id]).map((i) => i.id)])]
    setChosen({ artistIds, ideaIds })
  }

  function toggleIdea(id) {
    const ideaIds = selection.ideaIds.includes(id) ? selection.ideaIds.filter((i) => i !== id) : [...selection.ideaIds, id]
    setChosen({ ...selection, ideaIds })
  }

  const ownerArgs = () => ({ ownerId: owner.ownerId, store, assertCurrent: owner.assertCurrent, ...(clock ? { now: clock } : {}) })

  async function check(target = pack) {
    if (!owner || !target) return
    setPhase('checking')
    try {
      await verifyPack(target, ownerArgs())
    } catch {
      setNote('Couldn’t check the pack on this phone just now.')
    }
    setPhase('idle')
    onPackChange()
  }

  async function prepare() {
    if (!owner || busy) return
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    setNote('')
    setConfirming(false)
    setProgress({ done: 0, total: plan.photos.length })
    setPhase('running')
    // A hint to the browser to keep this site's storage; never a guarantee.
    void getStoragePersistence(globalThis.navigator?.storage, { request: true })
    let stopped = false
    try {
      await preparePack(plan, {
        ...ownerArgs(),
        ...(readPhoto ? { readPhoto } : {}),
        signal: abort.signal,
        onProgress: (done, total) => { if (mounted.current) setProgress({ done, total }) },
      })
    } catch (error) {
      // Left the page mid-run: the pack stays `preparing`, which reads as
      // interrupted next time, and Resume carries on from what was saved.
      if (!mounted.current || error?.code === 'owner_changed') return
      if (abort.signal.aborted) stopped = true
      else {
        setNote(isQuotaError(error)
          ? 'This phone’s storage for Sable is full, so nothing was saved. Free some space, or choose fewer artists.'
          : 'Couldn’t prepare the pack. Try again.')
      }
    }
    controller.current = null
    setPhase('idle')
    if (!stopped) {
      onPackChange()
      return
    }
    setNote('Stopped. What was saved stays; Resume to finish.')
    // Count what made it, so the interrupted pack says how far it got.
    const left = await store.getPack(owner.ownerId, plan.editionKey).catch(() => null)
    if (left && mounted.current) await check(left)
    else onPackChange()
  }

  function stop() {
    controller.current?.abort()
  }

  async function remove() {
    if (!owner || !pack) return
    setPhase('removing')
    try {
      await removePack(owner.ownerId, pack.editionKey, ownerArgs())
      setNote('Pack removed from this phone. Your artists, ideas and photos are unchanged.')
    } catch {
      setNote('Couldn’t remove the pack. Try again.')
    }
    setConfirming(false)
    setPhase('idle')
    onPackChange()
  }

  function toggleOpen() {
    const next = !expanded
    setExpanded(next)
    // Opening the panel re-reads the stored bytes: cheap, offline, and it keeps
    // "checked" honest about what is on the phone now.
    if (next && pack && phase === 'idle') void check()
  }

  const primaryLabel = { none: 'Prepare pack', interrupted: 'Resume', incomplete: 'Try again' }[status.state] || 'Refresh pack'
  const header = loaded ? HEADER[status.state] : 'Loading…'
  const nothingToPack = plan.artists.length === 0 && plan.ideas.length === 0
  // A tap on a chip changes what the next refresh would save, not the pack.
  // Said apart from a library change, with a way back, so a stray tap at the
  // venue never reads as a broken pack.
  const edited = Boolean(pack) && chosen !== null && !sameSelection(plan.selection, pack.selection)
  // One primary action per state: open a pack that is ready, otherwise fix it.
  const readyFresh = status.state === 'ready' && !stale

  const statusAndActions = (
    <>
      {running && <Progress progress={progress} onStop={stop} />}
      <StatusBlock status={status} pack={pack} stale={stale && !edited} />
      {note && <p role="status" className="text-xs font-mono text-cream-muted/90 mt-2">{note}</p>}

      {!running && owner && !confirming && (
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {pack && (
            <button type="button" onClick={() => onOpen(pack.editionKey)} className={readyFresh ? primaryClass : neutralClass}>Open pack</button>
          )}
          {!nothingToPack && (
            <button type="button" onClick={prepare} disabled={busy} className={readyFresh ? secondaryClass : primaryClass}>
              {primaryLabel}
            </button>
          )}
          {pack && (
            <button type="button" onClick={() => check()} disabled={busy} className={secondaryClass}>
              {phase === 'checking' ? 'Checking…' : 'Check again'}
            </button>
          )}
          {pack && (
            <button type="button" onClick={() => setConfirming(true)} disabled={busy} className={secondaryClass}>Remove pack</button>
          )}
        </div>
      )}

      {confirming && (
        <div className="mt-3 border border-ink-border rounded-xs p-3">
          <p className="text-cream text-sm font-body">
            Remove this pack from this phone? Your artists, ideas and photos stay as they are; only the offline copy goes.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <button type="button" onClick={() => setConfirming(false)} className={neutralClass}>Cancel</button>
            <button type="button" onClick={remove} disabled={busy} className={primaryClass}>Remove</button>
          </div>
        </div>
      )}
    </>
  )

  const choosing = (
    <div className={pack ? 'mt-4 pt-1 border-t border-ink-border/40' : ''}>
      {choices.length === 0 ? (
        <p className="text-cream-muted/90 text-xs font-mono mt-3">Mark who’s going first (Edit, above), or import the show’s line-up.</p>
      ) : (
        <Chips label={pack ? 'Artists in the pack' : 'Artists'} items={choices} selected={selection.artistIds} onToggle={toggleArtist} />
      )}
      {ideaChoices.length > 0 && (
        <Chips label="Ideas linked to them" items={ideaChoices} selected={selection.ideaIds} onToggle={toggleIdea} />
      )}
      {!nothingToPack && (
        <p className="text-[0.6875rem] font-mono text-cream-muted/80 mt-2">
          {plural(plan.artists.length, 'artist')} · {plural(plan.ideas.length, 'idea')} · {plural(plan.photos.length, 'photo')}
        </p>
      )}
      {edited && (
        <div className="flex flex-wrap items-center gap-x-2 mt-1">
          <p className="text-xs font-mono text-accent">Not saved to the pack yet: Refresh pack to save it.</p>
          <button type="button" onClick={() => setChosen(null)} className={secondaryClass}>Undo</button>
        </div>
      )}
    </div>
  )

  return (
    <div className="mt-3 pt-3 border-t border-ink-border">
      <button type="button" onClick={toggleOpen} aria-expanded={expanded} className="w-full min-h-11 flex items-center justify-between gap-2 text-left">
        <span className="text-[0.625rem] font-mono text-cream-muted tracking-widest uppercase">Offline pack</span>
        <span className={`text-[0.625rem] font-mono tracking-widest uppercase shrink-0 ${readyFresh ? 'text-accent' : 'text-cream-muted/80'}`}>
          {header}
          {status.state === 'ready' && status.checkedAt ? ` · ${formatPackTime(status.checkedAt, { time: false })}` : ''}
          <span className="text-cream-muted/80"> {expanded ? '▲' : '▼'}</span>
        </span>
      </button>

      {expanded && (
        <div className="mt-1">
          {pack ? (
            // At the venue the pack is what matters: its state and Open first.
            <>
              {statusAndActions}
              {choosing}
            </>
          ) : (
            <>
              <p className="text-cream-muted/90 text-xs font-body leading-relaxed">
                Save these artists, their photos and the ideas linked to them on this phone, so they open at the show with no signal.
              </p>
              {choosing}
              {statusAndActions}
            </>
          )}
          <p className="text-cream-muted/80 text-[0.6875rem] font-body leading-relaxed mt-3">
            On this phone only, not a backup: the browser can clear it when storage runs low. Check again before you leave.
          </p>
        </div>
      )}
    </div>
  )
}
