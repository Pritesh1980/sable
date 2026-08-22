import { useMemo, useState } from 'react'
import {
  LINEUP_SOURCES,
  filterLineup,
  groupLineup,
  indexLineup,
  lineupArtistDraft,
  lineupCounts,
  parseLineup,
} from '../data/lineup'

// The show's own artist list is 500 names in alphabetical order — useless on a
// phone the week before the doors open. This turns it into an index: search it,
// see at a glance which of them you already follow, add the ones you don't, and
// flag the ones you want to find on the floor.
//
// Only this many rows render at once. 500 list items is a lot of DOM for an
// iPhone, and a line-up is something you search, not scroll end to end.
const VISIBLE_LIMIT = 120

const VIEWS = [
  { id: 'all', label: 'All' },
  { id: 'saved', label: 'In your gallery' },
  { id: 'new', label: 'New to you' },
]

function LineupRow({ entry, convention, attending, onAddArtist, onToggleAttending }) {
  const saved = Boolean(entry.savedArtistId)
  return (
    <li
      data-testid={`lineup-row-${entry.handle || entry.label.toLowerCase().replace(/\s+/g, '-')}`}
      className="flex items-center gap-2 py-1 border-b border-ink-border/40 last:border-b-0"
    >
      <div className="flex-1 min-w-0">
        <p data-testid="lineup-label" className="text-cream text-sm font-body truncate">
          {entry.label}
        </p>
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
          onClick={() => onAddArtist(lineupArtistDraft(entry, convention.name))}
          className="min-h-11 px-2.5 flex items-center shrink-0 text-[0.625rem] font-mono text-cream-muted tracking-widest uppercase hover:text-accent transition-colors"
        >
          Add
        </button>
      ) : (
        // No handle in the show's list means nothing to save the artist by —
        // an invented one would be worse than none.
        <span className="text-[0.625rem] font-mono text-cream-muted/60 tracking-widest uppercase shrink-0 px-2.5">
          No handle
        </span>
      )}
    </li>
  )
}

function ImportPanel({ convention, onImport, hasEntries, onClear }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const sourceUrl = LINEUP_SOURCES[convention.id] || convention.url

  function submit() {
    const parsed = parseLineup(text)
    if (parsed.length === 0) {
      setError('Found no artists in that — paste the artist list itself, names one per line.')
      return
    }
    setError('')
    setText('')
    onImport(parsed)
  }

  return (
    <div className="mt-3">
      <p className="text-cream-muted/70 text-xs font-body leading-relaxed">
        Open the show&rsquo;s{' '}
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            artist list
          </a>
        ) : (
          'artist list'
        )}
        , select the names and paste them here — one artist per line, handles optional.
      </p>
      <label htmlFor={`lineup-paste-${convention.id}`} className="sr-only">
        Paste the line-up
      </label>
      <textarea
        id={`lineup-paste-${convention.id}`}
        value={text}
        onChange={(e) => { setText(e.target.value); setError('') }}
        rows={4}
        placeholder={'Oscar Akermo @oscarakermo\nMartin Kubala @kubalizmus — Slovakia'}
        className="w-full mt-2 bg-ink-black border border-ink-border rounded-xs px-3 py-2 text-cream text-sm font-mono placeholder:text-cream-muted/60 focus:border-accent outline-hidden"
      />
      {error && <p className="text-accent text-xs font-mono mt-1.5">{error}</p>}
      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={submit}
          className="min-h-11 px-3 flex items-center text-[0.625rem] font-mono text-accent tracking-widest uppercase hover:text-accent-hover transition-colors"
        >
          Import{hasEntries ? ' & merge' : ''}
        </button>
        {hasEntries && (
          <button
            onClick={onClear}
            className="min-h-11 px-3 flex items-center text-[0.625rem] font-mono text-cream-muted/50 tracking-widest uppercase hover:text-cream transition-colors"
          >
            Clear list
          </button>
        )}
      </div>
    </div>
  )
}

export default function ConventionLineup({
  convention,
  artists = [],
  entries = [],
  attendingIds = [],
  onImport = () => {},
  onClear = () => {},
  onAddArtist = () => {},
  onToggleAttending = () => {},
}) {
  const [expanded, setExpanded] = useState(false)
  const [importing, setImporting] = useState(false)
  const [query, setQuery] = useState('')
  const [view, setView] = useState('all')

  const indexed = useMemo(() => indexLineup(entries, artists), [entries, artists])
  const counts = lineupCounts(indexed)
  const matches = useMemo(() => filterLineup(indexed, { query, view }), [indexed, query, view])
  const groups = useMemo(() => groupLineup(matches.slice(0, VISIBLE_LIMIT)), [matches])
  const hidden = Math.max(0, matches.length - VISIBLE_LIMIT)

  return (
    <div className="mt-3 pt-3 border-t border-ink-border">
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full min-h-11 flex items-center justify-between gap-2 text-left"
      >
        <span className="text-[0.625rem] font-mono text-cream-muted tracking-widest uppercase">
          Artist index
        </span>
        <span className="text-[0.625rem] font-mono tracking-widest uppercase shrink-0">
          {counts.total > 0 ? (
            <>
              <span className="text-cream-muted/70">{counts.total} artists</span>
              <span className="text-accent"> · {counts.saved} in your gallery</span>
            </>
          ) : (
            <span className="text-cream-muted/60">Not imported</span>
          )}
          <span className="text-cream-muted/60"> {expanded ? '▲' : '▼'}</span>
        </span>
      </button>

      {expanded && counts.total === 0 && (
        <ImportPanel convention={convention} onImport={onImport} hasEntries={false} onClear={onClear} />
      )}

      {expanded && counts.total > 0 && (
        <div className="mt-2">
          <label htmlFor={`lineup-search-${convention.id}`} className="sr-only">
            Search the line-up
          </label>
          <input
            id={`lineup-search-${convention.id}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the line-up…"
            className="w-full bg-ink-black border border-ink-border rounded-xs px-3 min-h-11 text-cream text-sm font-mono placeholder:text-cream-muted/60 focus:border-accent outline-hidden"
          />

          <div className="flex flex-wrap gap-1.5 mt-2">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                aria-pressed={view === v.id}
                className={`min-h-11 px-2.5 flex items-center text-[0.625rem] font-mono tracking-widest uppercase border rounded-xs transition-colors ${
                  view === v.id
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-ink-border text-cream-muted/60 hover:text-cream hover:border-cream-muted'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {matches.length === 0 ? (
            <p className="text-cream-muted/60 text-xs font-mono mt-3">Nobody in the list matches that.</p>
          ) : (
            <div className="mt-2 max-h-96 overflow-y-auto pr-1">
              {groups.map((group) => (
                <div key={group.letter}>
                  <p className="text-[0.625rem] font-mono text-accent/60 tracking-[0.3em] uppercase mt-3 mb-1 sticky top-0 bg-ink-card py-1">
                    {group.letter}
                  </p>
                  <ul>
                    {group.entries.map((entry) => (
                      <LineupRow
                        key={entry.handle || entry.label}
                        entry={entry}
                        convention={convention}
                        attending={attendingIds.includes(entry.savedArtistId)}
                        onAddArtist={onAddArtist}
                        onToggleAttending={onToggleAttending}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {hidden > 0 && (
            <p className="text-cream-muted/60 text-[0.6875rem] font-mono mt-2">
              +{hidden} more — narrow it with search.
            </p>
          )}

          <button
            onClick={() => setImporting((v) => !v)}
            className="min-h-11 flex items-center text-[0.625rem] font-mono text-cream-muted/50 tracking-widest uppercase hover:text-cream transition-colors mt-1"
          >
            {importing ? 'Done' : 'Update list'}
          </button>
          {importing && (
            <ImportPanel
              convention={convention}
              hasEntries
              onClear={() => { onClear(); setImporting(false) }}
              onImport={(parsed) => { onImport(parsed); setImporting(false) }}
            />
          )}
        </div>
      )}
    </div>
  )
}
