import { useMemo, useState } from 'react'
import {
  groupWinners,
  indexWinners,
  parseWinners,
  winnerArtistDraft,
  winnerCounts,
  winnerKey,
} from '../data/winners'
import { compressImages } from '../hooks/useImageUpload'

// The results board, made useful after the show. A convention's line-up is 500
// names; its award list is the handful a room of judges just picked out of them,
// already sorted into the style brackets the gallery is tagged by. Same shape as
// ConventionLineup — paste it in, see who you already follow, add who you don't —
// with one addition: the winning tattoo itself, photographed off the trophy
// table, attached to the row.

const PLACING_LABEL = { 1: '1st', 2: '2nd', 3: '3rd' }

function PlacingBadge({ placing }) {
  if (!placing) return null
  return (
    <span
      className={`text-[0.625rem] font-mono tracking-widest uppercase shrink-0 ${
        placing === 1 ? 'text-accent' : 'text-cream-muted/70'
      }`}
    >
      {PLACING_LABEL[placing]}
    </span>
  )
}

// The photo is the point of the feature, so it gets the width. Attaching runs
// through the same compressImages the artist forms use, so a 12MP phone photo
// doesn't land in localStorage at full size.
function WinningTattoo({ entry, onSetPhoto }) {
  const [busy, setBusy] = useState(false)
  const key = winnerKey(entry)
  const inputId = `winner-photo-${key.replace(/[^a-z0-9]/gi, '-')}`

  async function attach(file) {
    if (!file || !file.type?.startsWith('image/')) return
    setBusy(true)
    try {
      const [dataUrl] = await compressImages([file])
      if (dataUrl) onSetPhoto(key, dataUrl)
    } finally {
      setBusy(false)
    }
  }

  if (entry.photo) {
    return (
      <div className="mt-1.5">
        <img
          src={entry.photo}
          alt={`Winning tattoo — ${entry.label}`}
          className="w-full max-h-64 object-contain bg-ink-black border border-ink-border rounded-xs"
        />
        <button
          onClick={() => onSetPhoto(key, '')}
          className="min-h-11 flex items-center text-[0.5625rem] font-mono text-cream-muted/50 tracking-widest uppercase hover:text-accent transition-colors"
        >
          Remove photo
        </button>
      </div>
    )
  }

  return (
    <div className="mt-0.5">
      <label
        htmlFor={inputId}
        className="inline-flex items-center min-h-11 text-[0.5625rem] font-mono text-cream-muted/50 tracking-widest uppercase cursor-pointer hover:text-accent transition-colors"
      >
        {busy ? 'Adding…' : '+ Add a photo of the winning tattoo'}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => attach(e.target.files?.[0])}
      />
    </div>
  )
}

function WinnerRow({ entry, convention, attending, onAddArtist, onToggleAttending, onSetPhoto }) {
  const saved = Boolean(entry.savedArtistId)
  const slug = entry.handle || entry.label.toLowerCase().replace(/\s+/g, '-')
  return (
    <li
      data-testid={`winner-row-${slug}`}
      className="flex flex-col gap-1 py-1.5 border-b border-ink-border/40 last:border-b-0"
    >
      <div className="flex items-center gap-2">
        <PlacingBadge placing={entry.placing} />
        <div className="flex-1 min-w-0">
          <p className="text-cream text-sm font-body truncate">{entry.label}</p>
          <div className="flex items-center gap-2 min-w-0">
            {entry.handle && (
              <a
                href={`https://instagram.com/${entry.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[0.6875rem] font-mono text-cream-muted/70 hover:text-accent transition-colors truncate"
              >
                @{entry.handle}
              </a>
            )}
            {entry.note && (
              <span className="text-[0.6875rem] font-mono text-cream-muted/60 truncate">{entry.note}</span>
            )}
          </div>
        </div>

        {saved && entry.artist?.rank ? (
          <span className="text-[0.6875rem] font-mono text-accent tracking-wide shrink-0">
            #{entry.artist.rank}
          </span>
        ) : null}

        {saved ? (
          <button
            onClick={() => onToggleAttending(entry.savedArtistId)}
            aria-pressed={attending}
            className={`min-h-11 px-2.5 flex items-center shrink-0 text-[0.625rem] font-mono tracking-widest uppercase transition-colors ${
              attending ? 'text-accent' : 'text-cream-muted/50 hover:text-cream'
            }`}
          >
            {attending ? '◎ Attending' : 'Attending?'}
          </button>
        ) : entry.handle ? (
          <button
            onClick={() => onAddArtist(winnerArtistDraft(entry, convention.name))}
            className="min-h-11 px-2.5 flex items-center shrink-0 text-[0.625rem] font-mono text-cream-muted tracking-widest uppercase hover:text-accent transition-colors"
          >
            Add
          </button>
        ) : (
          // A results board that printed no handle gives nothing to save the
          // artist by, and an invented one would be worse than none.
          <span className="text-[0.625rem] font-mono text-cream-muted/60 tracking-widest uppercase shrink-0 px-2.5">
            No handle
          </span>
        )}
      </div>
      <WinningTattoo entry={entry} onSetPhoto={onSetPhoto} />
    </li>
  )
}

function ImportPanel({ convention, onImport, onClear, hasEntries }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  function submit() {
    const parsed = parseWinners(text)
    if (!parsed.length) {
      setError('No winners found in that. One per line — “1st — Name @handle”, with the category on its own line above.')
      return
    }
    onImport(parsed)
    setText('')
    setError('')
  }

  return (
    <div className="mt-2">
      <p className="text-cream-muted/70 text-xs font-body leading-relaxed">
        Shows post results on the last afternoon — on the board by the stage, and afterwards on{' '}
        {convention.url ? (
          <a href={convention.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            their site
          </a>
        ) : (
          'their site'
        )}{' '}
        or Instagram. Paste them here: the award category on its own line, then the placings under it.
      </p>
      <label htmlFor={`winners-paste-${convention.id}`} className="sr-only">
        Paste the results
      </label>
      <textarea
        id={`winners-paste-${convention.id}`}
        value={text}
        onChange={(e) => { setText(e.target.value); setError('') }}
        rows={5}
        placeholder={'Best of Show\n1st - Oscar Akermo @oscarakermo\n\nBest Black & Grey\n1st - Zoia @zoia.ink\n2nd - Martin Kubala @kubalizmus'}
        className="w-full mt-2 bg-ink-black border border-ink-border rounded-xs px-3 py-2 text-cream text-sm font-mono placeholder:text-cream-muted/60 focus:border-accent outline-hidden"
      />
      {error && <p className="text-accent text-xs font-mono mt-1.5">{error}</p>}
      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={submit}
          className="min-h-11 px-3 flex items-center text-[0.625rem] font-mono text-accent tracking-widest uppercase hover:text-accent-hover transition-colors"
        >
          Import
        </button>
        {hasEntries && (
          <button
            onClick={onClear}
            className="min-h-11 px-3 flex items-center text-[0.625rem] font-mono text-cream-muted/50 tracking-widest uppercase hover:text-cream transition-colors"
          >
            Clear results
          </button>
        )}
      </div>
    </div>
  )
}

export default function ConventionWinners({
  convention,
  artists = [],
  entries = [],
  attendingIds = [],
  onImport = () => {},
  onClear = () => {},
  onAddArtist = () => {},
  onToggleAttending = () => {},
  onSetPhoto = () => {},
}) {
  const [expanded, setExpanded] = useState(false)

  const indexed = useMemo(() => indexWinners(entries, artists), [entries, artists])
  const counts = winnerCounts(indexed)
  const groups = useMemo(() => groupWinners(indexed), [indexed])

  return (
    <div className="mt-3 pt-3 border-t border-ink-border">
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full min-h-11 flex items-center justify-between gap-2 text-left"
      >
        <span className="text-[0.625rem] font-mono text-cream-muted tracking-widest uppercase">
          Competition winners
        </span>
        <span className="text-[0.625rem] font-mono tracking-widest uppercase shrink-0">
          {counts.total > 0 ? (
            <>
              <span className="text-cream-muted/70">{counts.total} winners</span>
              <span className="text-accent"> · {counts.saved} in your gallery</span>
              {counts.photos > 0 && (
                <span className="text-cream-muted/70">
                  {' '}· {counts.photos} photo{counts.photos === 1 ? '' : 's'}
                </span>
              )}
            </>
          ) : (
            <span className="text-cream-muted/60">Not imported</span>
          )}
          <span className="text-cream-muted/60"> {expanded ? '▲' : '▼'}</span>
        </span>
      </button>

      {expanded && counts.total === 0 && (
        <ImportPanel convention={convention} onImport={onImport} onClear={onClear} hasEntries={false} />
      )}

      {expanded && counts.total > 0 && (
        <div className="mt-2">
          {groups.map((group) => (
            <div key={group.category} className="mt-2 first:mt-0">
              <p
                data-testid="winner-category"
                className="text-[0.625rem] font-mono text-accent tracking-[0.2em] uppercase py-1 border-b border-ink-border"
              >
                {group.category}
              </p>
              <ul>
                {group.entries.map((entry) => (
                  <WinnerRow
                    key={winnerKey(entry)}
                    entry={entry}
                    convention={convention}
                    attending={attendingIds.includes(entry.savedArtistId)}
                    onAddArtist={onAddArtist}
                    onToggleAttending={onToggleAttending}
                    onSetPhoto={onSetPhoto}
                  />
                ))}
              </ul>
            </div>
          ))}
          <ImportPanel convention={convention} onImport={onImport} onClear={onClear} hasEntries />
        </div>
      )}
    </div>
  )
}
