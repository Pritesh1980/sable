import { useEffect, useId, useRef, useState } from 'react'
import { UK_PLACES, distanceFromMiltonKeynes } from '../data/places'
import { normalizeGuestSpot, splitGuestSpots, formatSpotDates, todayIso } from '../data/guestSpots'
import { analyzeGuestSpotImageWithGemini } from '../data/screenshotIntake'
import { compressImages } from '../hooks/useImageUpload'
import { randomId } from '../data/randomId'

export const GUEST_SPOTS_ANCHOR = 'guest-spots'

const EMPTY_FORM = { id: '', city: '', studio: '', startDate: '', endDate: '', source: '', notes: '' }
const LABEL = 'text-xs font-mono text-cream-muted tracking-widest uppercase'
const FIELD = 'w-full bg-ink-muted border border-ink-border rounded-xs px-3 py-2 text-sm text-cream outline-hidden focus:border-cream-muted/50 font-body placeholder-cream-muted/60'
const SMALL_BTN = 'min-h-11 px-2 font-mono text-[0.6875rem] tracking-widest uppercase transition-colors'

function distanceLabel(city) {
  const miles = distanceFromMiltonKeynes(city)
  if (miles == null) return 'distance unknown'
  return miles === 0 ? 'local' : `${miles} mi`
}

async function firstDataUrl(file) {
  const [dataUrl] = await compressImages([file])
  return dataUrl
}

function SpotRow({ spot, muted = false, onEdit, onRemove }) {
  return (
    <li className={`flex items-start justify-between gap-3 p-3 bg-ink-card border rounded-xs ${muted ? 'border-ink-border' : 'border-accent/25'}`}>
      <div className="min-w-0">
        <p className={`font-display text-base leading-tight ${muted ? 'text-cream-muted' : 'text-cream'}`}>
          <span>{spot.city}</span>
          {spot.studio && <span className="text-cream-muted"> · {spot.studio}</span>}
        </p>
        <p className="font-mono text-cream-muted/60 text-[0.625rem] tracking-widest mt-0.5">{formatSpotDates(spot)}</p>
        {spot.notes && <p className="text-cream-muted text-xs font-body mt-1">{spot.notes}</p>}
        {spot.source && (
          <a href={spot.source} target="_blank" rel="noopener noreferrer" className="inline-block font-mono text-[0.625rem] text-accent tracking-widest uppercase mt-1">
            Announcement
          </a>
        )}
      </div>
      <div className="flex flex-col items-end shrink-0">
        <span className="font-mono text-[0.625rem] text-cream-muted/50 mt-0.5">{distanceLabel(spot.city)}</span>
        <div className="flex gap-1">
          <button type="button" aria-label={`Edit ${spot.city} guest spot`} onClick={() => onEdit(spot)} className={`${SMALL_BTN} text-cream-muted hover:text-cream`}>Edit</button>
          <button type="button" aria-label={`Remove ${spot.city} guest spot`} onClick={() => onRemove(spot)} className={`${SMALL_BTN} text-accent/60 hover:text-accent`}>Remove</button>
        </div>
      </div>
    </li>
  )
}

// Guest spots on an artist (#183). `onChange(updater)` receives the latest
// stored list, so a save never writes back a stale copy of the other spots.
export default function GuestSpots({
  spots = [],
  onChange,
  today = todayIso(),
  analyze = analyzeGuestSpotImageWithGemini,
  toDataUrl = firstDataUrl,
}) {
  const formId = useId()
  const rootRef = useRef(null)
  const formRef = useRef(null)
  // Bumped on every new pick or read, so a slow read can't land on a newer screenshot.
  const readToken = useRef(0)
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [screenshot, setScreenshot] = useState(null)
  const [readFrom, setReadFrom] = useState(null)
  const [reading, setReading] = useState(false)
  const [readNote, setReadNote] = useState('')
  const [suggestions, setSuggestions] = useState([])
  // The key of the suggestion being reviewed, never its position: dismissing
  // another suggestion shifts positions (codex review).
  const [reviewing, setReviewing] = useState(null)
  const geminiKey = localStorage.getItem('gemini_api_key') || ''
  const { upcoming, past } = splitGuestSpots(spots, today)

  // Arriving from Nearby soon (…#guest-spots) lands here, not at the photos.
  useEffect(() => {
    if (globalThis.location?.hash === `#${GUEST_SPOTS_ANCHOR}`) rootRef.current?.scrollIntoView?.({ block: 'start' })
  }, [])

  useEffect(() => {
    if (form) formRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [form?.id, reviewing]) // eslint-disable-line react-hooks/exhaustive-deps -- scroll only when a different spot opens

  function openForm(values = EMPTY_FORM, suggestionKey = null) {
    const { key: _key, ...fields } = values
    setForm({ ...EMPTY_FORM, ...fields })
    setReviewing(suggestionKey)
    setError('')
  }

  function closeForm() {
    setForm(null)
    setReviewing(null)
    setError('')
  }

  function setStartDate(value) {
    // An empty or earlier To follows From, so the iPhone date wheel starts there.
    setForm((f) => ({ ...f, startDate: value, endDate: !f.endDate || f.endDate < value ? value : f.endDate }))
  }

  function save() {
    const spot = normalizeGuestSpot({ ...form, id: form.id || undefined })
    if (!spot) {
      setError('Add a city and a start date (the end date can’t be before it).')
      return
    }
    onChange((current = []) => {
      const list = Array.isArray(current) ? current : []
      return list.some((s) => s.id === spot.id)
        ? list.map((s) => (s.id === spot.id ? spot : s))
        : [...list, spot]
    })
    if (reviewing !== null) dropSuggestion(reviewing)
    closeForm()
  }

  function remove(spot) {
    if (!window.confirm(`Remove the ${spot.city} guest spot?`)) return
    onChange((current = []) => (Array.isArray(current) ? current : []).filter((s) => s.id !== spot.id))
  }

  function dropSuggestion(key) {
    const next = suggestions.filter((s) => s.key !== key)
    setSuggestions(next)
    if (next.length === 0) setReadFrom(null)
    if (reviewing === key) closeForm()
  }

  async function chooseScreenshot(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const token = ++readToken.current
    setReadNote('')
    setSuggestions([])
    setReadFrom(null)
    try {
      const dataUrl = await toDataUrl(file)
      if (token === readToken.current) setScreenshot(dataUrl)
    } catch {
      if (token !== readToken.current) return
      setScreenshot(null)
      setReadNote('That image could not be opened.')
    }
  }

  // The only place an image leaves the device, and only on this tap.
  async function readDates() {
    const token = ++readToken.current
    const image = screenshot
    setReading(true)
    setReadNote('')
    try {
      const found = await analyze(geminiKey, image, today)
      if (token !== readToken.current) return
      setSuggestions(found.map((s) => ({ ...s, key: randomId() })))
      setReadFrom(found.length ? image : null)
      setReadNote(found.length ? `Found ${found.length}. Check each against the screenshot before saving.` : "Couldn't find any dates in that image.")
      setScreenshot(null)
    } catch {
      if (token === readToken.current) setReadNote('Gemini could not read that image. Try again, or add the dates by hand.')
    } finally {
      if (token === readToken.current) setReading(false)
    }
  }

  const formDistance = form?.city.trim() ? distanceFromMiltonKeynes(form.city) : null

  const formEl = form && (
    <div ref={formRef} className="p-3 bg-ink-card border border-ink-border rounded-xs space-y-3 mb-3">
      {reviewing !== null && <p className="font-mono text-[0.625rem] text-accent tracking-widest uppercase">Read from the screenshot. Check it, then save.</p>}
      <div>
        <label htmlFor={`${formId}-city`} className={`${LABEL} block mb-1`}>City</label>
        <input id={`${formId}-city`} list={`${formId}-places`} className={FIELD} value={form.city} maxLength={60}
          onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
        <datalist id={`${formId}-places`}>
          {UK_PLACES.map((p) => <option key={p.city} value={p.city} />)}
        </datalist>
        {form.city.trim() && (
          <p className="font-mono text-[0.625rem] text-cream-muted/70 tracking-wide mt-1">
            {formDistance == null
              ? 'Distance unknown, so it won’t appear in Nearby soon. If it’s near a city in the list, use that.'
              : `${formDistance} mi from Milton Keynes`}
          </p>
        )}
      </div>
      <div>
        <label htmlFor={`${formId}-studio`} className={`${LABEL} block mb-1`}>Studio</label>
        <input id={`${formId}-studio`} className={FIELD} value={form.studio} maxLength={80}
          onChange={(e) => setForm((f) => ({ ...f, studio: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${formId}-start`} className={`${LABEL} block mb-1`}>From</label>
          <input id={`${formId}-start`} type="date" className={FIELD} value={form.startDate}
            onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${formId}-end`} className={`${LABEL} block mb-1`}>To</label>
          <input id={`${formId}-end`} type="date" className={FIELD} value={form.endDate} min={form.startDate || undefined}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
        </div>
      </div>
      <div>
        <label htmlFor={`${formId}-source`} className={`${LABEL} block mb-1`}>Link</label>
        <input id={`${formId}-source`} type="url" inputMode="url" placeholder="https://www.instagram.com/p/…" className={FIELD} value={form.source}
          onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} />
      </div>
      <div>
        <label htmlFor={`${formId}-notes`} className={`${LABEL} block mb-1`}>Notes</label>
        <input id={`${formId}-notes`} className={FIELD} value={form.notes} maxLength={500} placeholder="Books open 1 Mar, DM to book…"
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
      </div>
      {error && <p role="alert" className="text-accent text-xs font-body">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={closeForm} className={`${SMALL_BTN} text-cream-muted hover:text-cream`}>Cancel</button>
        <button type="button" onClick={save} aria-label="Save guest spot" className={`${SMALL_BTN} text-accent hover:text-accent-hover`}>Save</button>
      </div>
    </div>
  )

  return (
    <div ref={rootRef} id={GUEST_SPOTS_ANCHOR} className="mb-6 scroll-mt-20">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className={LABEL}>Guest spots</p>
        {!form && (
          <button type="button" onClick={() => openForm()} className={`${SMALL_BTN} text-accent hover:text-accent-hover`}>
            + Add guest spot
          </button>
        )}
      </div>

      {upcoming.length > 0 ? (
        <ul aria-label="Upcoming guest spots" className="space-y-2 mb-3">
          {upcoming.map((spot) => <SpotRow key={spot.id} spot={spot} onEdit={openForm} onRemove={remove} />)}
        </ul>
      ) : (
        !form && <p className="text-cream-muted/70 text-sm font-body mb-3">No guest spots coming up.</p>
      )}

      {reviewing === null && formEl}

      {/* Screenshot mode: pick an announcement, then tap to send it to Gemini. */}
      <div className="mb-3">
        {geminiKey ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className={`${SMALL_BTN} inline-flex items-center text-cream-muted hover:text-cream ${reading ? 'opacity-40' : 'cursor-pointer'}`}>
              From a screenshot
              <input type="file" accept="image/*" aria-label="Guest spot screenshot" className="sr-only" disabled={reading} onChange={chooseScreenshot} />
            </label>
            {screenshot && (
              <button type="button" onClick={readDates} disabled={reading} className={`${SMALL_BTN} text-accent hover:text-accent-hover disabled:opacity-40`}>
                {reading ? 'Reading…' : 'Read dates'}
              </button>
            )}
          </div>
        ) : (
          <p className="text-cream-muted/60 text-xs font-body">Add a Gemini key (Concepts → AI setup) to fill these in from an announcement screenshot.</p>
        )}
        {readNote && <p role="status" className="font-mono text-[0.625rem] text-cream-muted/80 tracking-wide mt-1">{readNote}</p>}
      </div>

      {suggestions.length > 0 && (
        <div className="mb-3">
          {readFrom && (
            <details open className="mb-2">
              <summary className={`${LABEL} cursor-pointer min-h-11 flex items-center`}>Screenshot</summary>
              <img src={readFrom} alt="Announcement screenshot" className="max-h-72 w-auto rounded-xs border border-ink-border" />
            </details>
          )}
          <ul aria-label="Suggested guest spots" className="space-y-2 mb-3">
            {suggestions.map((s) => (
              <li key={s.key} className={`flex items-center justify-between gap-3 p-3 border border-dashed rounded-xs ${reviewing === s.key ? 'border-accent/60' : 'border-ink-border'}`}>
                <div className="min-w-0">
                  <p className="font-display text-cream text-sm leading-tight">{s.city}{s.studio && <span className="text-cream-muted"> · {s.studio}</span>}</p>
                  <p className="font-mono text-cream-muted/60 text-[0.625rem] tracking-widest mt-0.5">{formatSpotDates(s)} · {distanceLabel(s.city)}</p>
                  {s.notes && <p className="text-cream-muted text-xs font-body mt-0.5">{s.notes}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button type="button" aria-label={`Review ${s.city}`} onClick={() => openForm(s, s.key)} className={`${SMALL_BTN} text-accent hover:text-accent-hover`}>Review</button>
                  <button type="button" aria-label={`Dismiss ${s.city}`} onClick={() => dropSuggestion(s.key)} className={`${SMALL_BTN} text-cream-muted hover:text-cream`}>Dismiss</button>
                </div>
              </li>
            ))}
          </ul>
          {reviewing !== null && formEl}
        </div>
      )}

      {past.length > 0 && (
        <details>
          <summary className={`${LABEL} cursor-pointer min-h-11 flex items-center`}>Past ({past.length})</summary>
          <ul aria-label="Past guest spots" className="space-y-2 mt-2">
            {past.map((spot) => <SpotRow key={spot.id} spot={spot} muted onEdit={openForm} onRemove={remove} />)}
          </ul>
        </details>
      )}
    </div>
  )
}
