import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import ArtistImage from './ArtistImage'
import useDialogFocus, { isTopmostDialog } from '../hooks/useDialogFocus'
import { describeTattooWithGemini, readDescription, saveDescription } from '../data/tattooDescription'
import { refIdentity } from '../data/imageRef'
import { imageUrlToDataUrl, shrinkImageDataUrl } from '../data/skinPreview'

const BUTTON = 'min-h-11 flex items-center justify-center bg-v2-ink border border-v2-hairline hover:border-v2-accent rounded-xs px-4 py-2 text-v2-cream font-v2-ui text-sm transition-colors'

// The photo goes to Gemini at a modest size: enough to read the linework,
// small enough to stay a cheap, quick request.
async function describeWithGemini(apiKey, image) {
  const dataUrl = await shrinkImageDataUrl(await imageUrlToDataUrl(image), 1024)
  return describeTattooWithGemini(apiKey, dataUrl)
}

function readKey() {
  try {
    return localStorage.getItem('gemini_api_key') || ''
  } catch {
    return ''
  }
}

// One request per photo at a time, shared across sheet mounts: closing and
// reopening the sheet while Gemini is still answering waits for that answer
// rather than paying for a second one.
const inFlight = new Map()

// "Describe tattoo" (#220 K): a sheet over the viewer with Gemini's short
// description of the photo's tattoo. Nothing is sent until the Describe tap,
// with the user's own key; a kept description shows straight away.
export default function DescribeTattoo({ item, onClose, describe = describeWithGemini }) {
  const dialogRef = useDialogFocus(true)
  const [apiKey] = useState(readKey)
  const id = refIdentity(item.image)
  const [state, setState] = useState(() => {
    const kept = readDescription(item.image)
    if (kept) return { status: 'done', result: kept }
    if (inFlight.has(id)) return { status: 'loading' }
    return { status: apiKey ? 'ready' : 'nokey' }
  })
  const alive = useRef(true)

  // Settles the sheet from a request; whoever starts it shows 'loading' first.
  const follow = useCallback((request) => {
    request.then(
      (result) => alive.current && setState(result.notTattoo ? { status: 'notTattoo' } : { status: 'done', result }),
      () => alive.current && setState({ status: 'error' })
    )
  }, [])

  const run = useCallback(() => {
    let request = inFlight.get(id)
    if (!request) {
      request = (async () => {
        const result = await describe(apiKey, item.image)
        // Kept even if the sheet has closed: the request has been paid for.
        if (!result.notTattoo) saveDescription(item.image, result)
        return result
      })()
      request.catch((e) => console.error('[tattoo] describe failed:', e)).finally(() => inFlight.delete(id))
      inFlight.set(id, request)
    }
    setState({ status: 'loading' })
    follow(request)
  }, [apiKey, describe, follow, id, item.image])

  // Reopened while a request is still out: wait for it.
  useEffect(() => {
    alive.current = true
    const pending = inFlight.get(id)
    if (pending) follow(pending)
    return () => {
      alive.current = false
    }
  }, [id, follow])

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

  let body
  if (state.status === 'nokey') {
    body = (
      <p className="font-v2-ui text-sm text-v2-cream leading-relaxed">
        Describing a photo needs a Gemini key, which stays on this device. Add one in{' '}
        <Link to="/settings" className="text-v2-accent underline underline-offset-4">Settings</Link>.
      </p>
    )
  } else if (state.status === 'ready') {
    body = (
      <div>
        <p className="font-v2-ui text-sm text-v2-cream leading-relaxed mb-4">
          Gemini describes the tattoo in this photo and the styles it fits. Describe sends this one
          photo to Google, with your key.
        </p>
        <button type="button" onClick={run} className={BUTTON}>Describe</button>
      </div>
    )
  } else if (state.status === 'loading') {
    body = (
      <p role="status" className="font-v2-ui text-sm text-v2-cream">
        Describing…
      </p>
    )
  } else if (state.status === 'error') {
    body = (
      <div>
        <p role="alert" className="font-v2-ui text-sm text-v2-accent mb-4">
          Could not describe this photo. Check your connection and Gemini key.
        </p>
        <button type="button" onClick={run} className={BUTTON}>Try again</button>
      </div>
    )
  } else if (state.status === 'notTattoo') {
    body = (
      <div>
        <p className="font-v2-ui text-sm text-v2-cream mb-4">Gemini didn’t find a tattoo in this photo.</p>
        <button type="button" onClick={run} className={BUTTON}>Try again</button>
      </div>
    )
  } else {
    const { text, styles = [] } = state.result
    body = (
      <div>
        <p className="font-v2-ui text-base text-v2-cream leading-relaxed">{text}</p>
        {styles.length > 0 && (
          <ul aria-label="Styles" className="flex flex-wrap gap-2 mt-4">
            {styles.map((s) => (
              <li key={s} className="font-v2-ui text-xs tracking-widest uppercase text-v2-cream border border-v2-hairline rounded-xs px-2 py-1">
                {s}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
          <p className="font-v2-ui text-xs text-v2-muted">Described by Gemini. It can be wrong.</p>
          {apiKey && <button type="button" onClick={run} className={BUTTON}>Describe again</button>}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Describe tattoo"
      tabIndex={-1}
      className="fixed inset-x-0 bottom-0 z-[70] max-h-[85dvh] flex flex-col bg-v2-ink border-t border-v2-hairline focus:outline-hidden animate-slide-up sm:left-auto sm:right-6 sm:bottom-6 sm:w-[28rem] sm:border sm:rounded-xs"
    >
      <div className="flex items-center justify-between gap-3 pt-3 pb-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] border-b border-v2-hairline">
        <div className="flex items-center gap-3 min-w-0">
          <ArtistImage
            src={item.image}
            label={item.artistName}
            sizes="40px"
            className="w-10 h-10 shrink-0 object-cover rounded-xs"
            monogramClassName="text-lg"
          />
          <h2 className="font-v2-display text-lg tracking-[0.2em] uppercase text-v2-cream truncate">Describe tattoo</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close describe tattoo" className={`${BUTTON} tracking-widest uppercase text-xs`}>
          Close
        </button>
      </div>
      <div className="overflow-y-auto pt-5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {body}
      </div>
    </div>
  )
}
