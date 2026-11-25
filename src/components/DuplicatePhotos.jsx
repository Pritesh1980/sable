import { useEffect, useMemo, useRef, useState } from 'react'
import RefImage from './RefImage'
import {
  collectPhotoUses, fingerprintPhotos, findDuplicateGroups, scanSummary, removalCheck, removeCopy, restoreCopy,
} from '../data/duplicatePhotos'

// Settings → Duplicate photos (#210). Finds byte-identical photos on this
// device; removes nothing unless the owner picks one copy inside one artist or
// idea, confirms, and can undo. The rules live in src/data/duplicatePhotos.js.

const KIND = { artist: 'Artist', idea: 'Idea', concept: 'Concept', variant: 'Concept variant', saved: 'Saved photo' }
const BLOCKED = {
  favourite: 'Favourited, so it stays. Remove the other copy instead.',
  note: 'Has its own note, so it stays. Remove the other copy instead.',
  crop: 'Has its own Brief card crop, so it stays. Remove the other copy instead.',
}

const plural = (n, one, many) => (n === 1 ? one : many)

function whereLine(use) {
  if (use.kind === 'saved') return KIND.saved
  const where = `${KIND[use.kind]} · ${use.label}`
  return use.of > 1 ? `${where}, ${use.kind === 'variant' ? 'variant' : 'photo'} ${use.position} of ${use.of}` : where
}

function Coverage({ summary, groups }) {
  const { total, checked, external, unavailable, unchecked } = summary
  return (
    <div className="text-sm font-body text-cream-muted/90 leading-relaxed space-y-1 mt-4">
      <p>Checked {checked} of {total} {plural(total, 'photo', 'photos')}.</p>
      {external > 0 && (
        <p>{external} {plural(external, 'is a link', 'are links')} to another site, so {plural(external, 'it wasn’t', 'they weren’t')} compared.</p>
      )}
      {unavailable > 0 && (
        <p>{unavailable} couldn’t be read right now (offline, or the photo is missing), so {plural(unavailable, 'it wasn’t', 'they weren’t')} compared.</p>
      )}
      {unchecked > 0 && <p>{unchecked} added since this check.</p>}
      <p className="text-cream">
        {groups.length
          ? `${groups.length} ${plural(groups.length, 'photo appears', 'photos appear')} more than once.`
          : 'No duplicates among the photos checked.'}
      </p>
    </div>
  )
}

function UseRow({ use, copyNumber, keepNumber, check, confirming, onAsk, onCancel, onConfirm }) {
  return (
    <li className="text-sm font-body">
      <p className="text-cream">{whereLine(use)}</p>
      {use.note && <p className="text-cream-muted/90 text-xs">“{use.note}”</p>}
      {check.reason && <p className="text-cream-muted/90 text-xs mt-1">{BLOCKED[check.reason]}</p>}
      {check.removable && !confirming && (
        <button
          type="button"
          onClick={onAsk}
          aria-label={`Remove this copy from ${use.label} (copy ${copyNumber})`}
          className="mt-1 min-h-11 px-3 rounded-xs border border-ink-border font-mono text-xs tracking-widest uppercase text-cream-muted hover:text-accent hover:border-accent transition-colors"
        >
          Remove this copy
        </button>
      )}
      {check.removable && confirming && (
        <div className="mt-2 border border-ink-border rounded-xs p-3">
          <p className="text-cream text-sm">
            Remove copy {copyNumber} from {use.label}? Copy {keepNumber} stays there, and nothing else changes.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              onClick={onConfirm}
              className="px-4 min-h-11 bg-accent hover:bg-accent-hover text-cream text-sm font-body rounded-xs transition-colors"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 min-h-11 border border-ink-border hover:border-cream-muted/50 text-cream-muted hover:text-cream text-sm font-body rounded-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function Group({ group, favourites, confirming, setConfirming, onRemove }) {
  const numberOf = (id) => group.copies.findIndex((c) => c.id === id) + 1
  return (
    <li aria-label={`Same photo, ${group.copies.length} copies`} className="border-t border-ink-border pt-4">
      {/* The copies are byte-identical, so one thumbnail shows them all and the rows get the width. */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-16 h-16 rounded-xs overflow-hidden bg-ink-muted shrink-0">
          <RefImage src={group.copies[0].ref} alt="" className="w-full h-full object-cover" />
        </div>
        <p className="text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase">
          Same photo, {group.copies.length} copies
        </p>
      </div>
      <ol className="space-y-4">
        {group.copies.map((copy, i) => (
          <li key={copy.id}>
            <p className="text-xs font-mono text-cream-muted tracking-widest uppercase">Copy {i + 1}</p>
            <ul className="space-y-2 mt-1">
              {copy.uses.map((use) => {
                const check = removalCheck(group, copy, use, { favourites })
                const id = `${copy.id}|${use.kind}:${use.recordId}:${use.position}`
                return (
                  <UseRow
                    key={`${use.kind}:${use.recordId}:${use.position}`}
                    use={use}
                    copyNumber={i + 1}
                    keepNumber={check.removable ? numberOf(check.keepId) : 0}
                    check={check}
                    confirming={confirming === id}
                    onAsk={() => setConfirming(id)}
                    onCancel={() => setConfirming(null)}
                    onConfirm={() => onRemove(use, copy, check.keepId)}
                  />
                )
              })}
            </ul>
          </li>
        ))}
      </ol>
      {group.spansRecords && (
        <p className="text-xs font-body text-cream-muted/90 mt-3">
          {group.sameRecord
            ? 'Copies in different places stay as they are: that can be on purpose.'
            : 'These are in different places. That can be on purpose, so Sable leaves them as they are.'}
        </p>
      )}
    </li>
  )
}

export default function DuplicatePhotos({
  artists = [], setArtists, ideas = [], setIdeas, concepts = [], saved = [], favourites = [], readBlob,
}) {
  const [phase, setPhase] = useState('idle') // idle | scanning | stopped | done
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [prints, setPrints] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [status, setStatus] = useState(null) // { text, undo? }
  const controller = useRef(null)
  const statusRef = useRef(null)
  const undoRef = useRef(null)

  useEffect(() => () => controller.current?.abort(), [])

  // The button that was tapped unmounts with its group, so focus (and, on a
  // phone, the scroll position) moves to the outcome and its Undo.
  useEffect(() => {
    if (!status?.focus) return
    const target = undoRef.current || statusRef.current
    target?.focus()
    target?.scrollIntoView?.({ block: 'nearest' })
  }, [status])

  const uses = useMemo(() => collectPhotoUses({ artists, ideas, concepts, saved }), [artists, ideas, concepts, saved])
  const groups = useMemo(() => (prints ? findDuplicateGroups(uses, prints) : []), [uses, prints])
  const summary = useMemo(() => (prints ? scanSummary(uses, prints) : null), [uses, prints])

  async function runCheck() {
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    setPrints(null)
    setConfirming(null)
    setStatus(null)
    setProgress({ done: 0, total: new Set(uses.map((u) => u.id)).size })
    setPhase('scanning')
    try {
      const next = await fingerprintPhotos(uses.map((u) => u.ref), {
        ...(readBlob ? { readBlob } : {}),
        signal: abort.signal,
        onProgress: (done, total) => { if (controller.current === abort) setProgress({ done, total }) },
      })
      if (controller.current !== abort) return
      setPrints(next)
      setPhase('done')
    } catch {
      if (controller.current === abort) setPhase('stopped')
    }
  }

  // A photo read already in flight can't be cancelled (the fetch doesn't take
  // the signal), so Stop doesn't wait for it: the run is dropped at once, and
  // whatever it returns later is ignored.
  function stop() {
    controller.current?.abort()
    controller.current = null
    setPhase('stopped')
  }

  const setterFor = (kind) => (kind === 'artist' ? setArtists : setIdeas)
  const recordsFor = (kind) => (kind === 'artist' ? artists : ideas)

  function remove(use, copy, keepId) {
    setConfirming(null)
    const args = { recordId: use.recordId, id: copy.id, index: use.position - 1, keepId }
    const result = removeCopy(recordsFor(use.kind), args)
    if (!result) {
      setStatus({ text: `${use.label} changed since the check. Check again.`, focus: true })
      return
    }
    setterFor(use.kind)((prev) => removeCopy(prev, args)?.records ?? prev)
    // Copy numbers shift once a copy is gone, so the outcome names the place.
    setStatus({ text: `Removed a copy from ${use.label}.`, undo: { kind: use.kind, undo: result.undo, label: use.label }, focus: true })
  }

  function undo() {
    const { kind, undo: payload, label } = status.undo
    setterFor(kind)((prev) => restoreCopy(prev, payload))
    setStatus({ text: `Put the copy back in ${label}.`, focus: true })
  }

  const scanning = phase === 'scanning'

  return (
    <section aria-labelledby="duplicate-photos-heading" className="bg-ink-card border border-ink-border rounded-xs p-4 mb-8">
      <p id="duplicate-photos-heading" className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-1">Duplicate photos</p>
      <p className="text-cream-muted/90 text-sm font-body leading-relaxed mb-4">
        Find photos you’ve added more than once, even under different names. Sable compares the photos themselves, on this device. Nothing is removed unless you choose to.
      </p>

      {scanning ? (
        <div>
          <div
            role="progressbar"
            aria-label="Checking photos"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            className="h-1 bg-ink-muted rounded-xs overflow-hidden"
          >
            <div className="h-full bg-accent transition-[width]" style={{ width: `${progress.total ? (100 * progress.done) / progress.total : 0}%` }} />
          </div>
          <div className="flex items-center justify-between gap-4 mt-2">
            <p className="text-xs font-mono text-cream-muted/90">Checking photo {Math.min(progress.done + 1, progress.total)} of {progress.total}…</p>
            <button
              type="button"
              onClick={stop}
              className="px-4 min-h-11 border border-ink-border hover:border-cream-muted/50 text-cream-muted hover:text-cream text-sm font-body rounded-xs transition-colors"
            >
              Stop
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={runCheck}
          className="px-4 min-h-11 border border-ink-border hover:border-cream-muted/50 text-cream-muted hover:text-cream text-sm font-body rounded-xs transition-colors"
        >
          {prints ? 'Check again' : 'Check for duplicates'}
        </button>
      )}

      {phase === 'stopped' && <p className="text-xs font-mono text-cream-muted/90 mt-3">Stopped. Nothing was changed.</p>}

      {status && (
        <div ref={statusRef} tabIndex={-1} role="status" className="flex flex-wrap items-center gap-3 mt-3 text-xs font-mono text-cream-muted/90 outline-hidden">
          <span>{status.text}</span>
          {status.undo && (
            <button ref={undoRef} type="button" onClick={undo} className="min-h-11 px-3 text-accent hover:text-accent-hover underline">
              Undo
            </button>
          )}
        </div>
      )}

      {summary && <Coverage summary={summary} groups={groups} />}

      {groups.length > 0 && (
        <ul aria-label="Duplicate photos found" className="mt-4 space-y-4">
          {groups.map((group) => (
            <Group
              key={group.hash}
              group={group}
              favourites={favourites}
              confirming={confirming}
              setConfirming={setConfirming}
              onRemove={remove}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
