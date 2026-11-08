import { useId, useState } from 'react'
import { UK_PLACES, distanceFromMiltonKeynes } from '../data/places'
import { normalizeGuestSpot, splitGuestSpots, formatSpotDates, todayIso } from '../data/guestSpots'
import { analyzeGuestSpotImageWithGemini } from '../data/screenshotIntake'
import { compressImages } from '../hooks/useImageUpload'

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
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [screenshot, setScreenshot] = useState(null)
  const [reading, setReading] = useState(false)
  const [readNote, setReadNote] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [reviewing, setReviewing] = useState(null)
  const geminiKey = localStorage.getItem('gemini_api_key') || ''
  const { upcoming, past } = splitGuestSpots(spots, today)

  function openForm(values = EMPTY_FORM, fromSuggestion = null) {
    setForm({ ...EMPTY_FORM, ...values })
    setReviewing(fromSuggestion)
    setError('')
  }

  function closeForm() {
    setForm(null)
    setReviewing(null)
    setError('')
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
    if (reviewing !== null) setSuggestions((list) => list.filter((_, i) => i !== reviewing))
    closeForm()
  }

  function remove(spot) {
    if (!window.confirm(`Remove the ${spot.city} guest spot?`)) return
    onChange((current = []) => (Array.isArray(current) ? current : []).filter((s) => s.id !== spot.id))
  }

  async function chooseScreenshot(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setReadNote('')
    setSuggestions([])
    try {
      setScreenshot(await toDataUrl(file))
    } catch {
      setScreenshot(null)
      setReadNote('That image could not be opened.')
    }
  }

  // The only place an image leaves the device, and only on this tap.
  async function readDates() {
    setReading(true)
    setReadNote('')
    try {
      const found = await analyze(geminiKey, screenshot, today)
      setSuggestions(found)
      setReadNote(found.length ? `Found ${found.length}. Check each one before saving.` : "Couldn't find any dates in that image.")
      setScreenshot(null)
    } catch {
      setReadNote('Gemini could not read that image. Try again, or add the dates by hand.')
    } finally {
      setReading(false)
    }
  }

  const formDistance = form?.city ? distanceFromMiltonKeynes(form.city) : null

  return (
    <div className="mb-6">
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

      {form && (
        <div className="p-3 bg-ink-card border border-ink-border rounded-xs space-y-3 mb-3">
          {reviewing !== null && <p className="font-mono text-[0.625rem] text-accent tracking-widest uppercase">Read from the screenshot. Check it, then save.</p>}
          <div>
            <label htmlFor={`${formId}-city`} className={`${LABEL} block mb-1`}>City</label>
            <input id={`${formId}-city`} list={`${formId}-places`} className={FIELD} value={form.city} maxLength={60}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            <datalist id={`${formId}-places`}>
              {UK_PLACES.map((p) => <option key={p.city} value={p.city} />)}
            </datalist>
            {form.city.trim() && (
              <p className="font-mono text-[0.625rem] text-cream-muted/70 tracking-widest mt-1">
                {formDistance == null ? 'distance unknown' : `${formDistance} mi from Milton Keynes`}
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
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <label htmlFor={`${formId}-end`} className={`${LABEL} block mb-1`}>To</label>
              <input id={`${formId}-end`} type="date" className={FIELD} value={form.endDate}
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
            <input id={`${formId}-notes`} className={FIELD} value={form.notes} maxLength={500} placeholder="DM to book, books open…"
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          {error && <p role="alert" className="text-accent text-xs font-body">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeForm} className={`${SMALL_BTN} text-cream-muted hover:text-cream`}>Cancel</button>
            <button type="button" onClick={save} aria-label="Save guest spot" className={`${SMALL_BTN} text-accent hover:text-accent-hover`}>Save</button>
          </div>
        </div>
      )}

      {/* Screenshot mode: pick an announcement, then tap to send it to Gemini. */}
      <div className="mb-3">
        {geminiKey ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className={`${SMALL_BTN} inline-flex items-center text-cream-muted hover:text-cream cursor-pointer`}>
              From a screenshot
              <input type="file" accept="image/*" aria-label="Guest spot screenshot" className="sr-only" onChange={chooseScreenshot} />
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
        <ul aria-label="Suggested guest spots" className="space-y-2 mb-3">
          {suggestions.map((s, i) => (
            <li key={`${s.city}-${s.startDate}-${i}`} className="flex items-center justify-between gap-3 p-3 border border-dashed border-ink-border rounded-xs">
              <div className="min-w-0">
                <p className="font-display text-cream text-sm leading-tight">{s.city}{s.studio && <span className="text-cream-muted"> · {s.studio}</span>}</p>
                <p className="font-mono text-cream-muted/60 text-[0.625rem] tracking-widest mt-0.5">{formatSpotDates(s)} · {distanceLabel(s.city)}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button type="button" aria-label={`Review ${s.city}`} onClick={() => openForm(s, i)} className={`${SMALL_BTN} text-accent hover:text-accent-hover`}>Review</button>
                <button type="button" aria-label={`Dismiss ${s.city}`} onClick={() => setSuggestions((list) => list.filter((_, j) => j !== i))} className={`${SMALL_BTN} text-cream-muted hover:text-cream`}>Dismiss</button>
              </div>
            </li>
          ))}
        </ul>
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
