import { useId, useState } from 'react'
import { STYLE_TAGS } from '../data/artists'
import TagPill from './TagPill'

export default function StyleTagPicker({ tags, onToggle, label = 'Style tags' }) {
  const [editingCustomTags, setEditingCustomTags] = useState(null)
  const expanded = editingCustomTags !== null
  const labelId = useId()
  const choicesId = useId()
  const selected = [...new Set(tags ?? [])]
  const customTags = selected.filter((tag) => !STYLE_TAGS.includes(tag))
  const choices = [...new Set([...STYLE_TAGS, ...(editingCustomTags ?? []), ...customTags])]

  function toggle(tag) {
    // Keep custom choices available for undo until Done, including tags synced in while open.
    if (customTags.includes(tag) && !editingCustomTags.includes(tag)) {
      setEditingCustomTags([...editingCustomTags, tag])
    }
    onToggle(tag)
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p id={labelId} className="font-v2-ui text-[0.68rem] uppercase tracking-[0.14em] text-v2-muted">
          {label}
        </p>
        <button
          type="button"
          aria-label={expanded ? 'Done editing styles' : undefined}
          aria-expanded={expanded}
          aria-controls={choicesId}
          onClick={() => setEditingCustomTags(expanded ? null : customTags)}
          className="min-h-11 shrink-0 rounded-xs px-2 font-v2-ui text-sm text-v2-cream hover:text-v2-accent focus-visible:ring-2 focus-visible:ring-v2-accent disabled:opacity-40"
        >
          {expanded ? 'Done' : 'Edit styles'}
        </button>
      </div>

      <div id={choicesId} role="group" aria-labelledby={labelId} hidden={!expanded}>
        {expanded && (
          <div className="flex flex-wrap gap-1.5">
            {choices.map((tag) => (
              <TagPill
                key={tag}
                tag={tag}
                active={selected.includes(tag)}
                pressed={selected.includes(tag)}
                onClick={() => toggle(tag)}
                minTapHeight
              />
            ))}
          </div>
        )}
      </div>

      {!expanded && (selected.length > 0
        ? <div className="flex flex-wrap gap-1.5">{selected.map((tag) => <TagPill key={tag} tag={tag} active />)}</div>
        : <p className="font-v2-ui text-sm text-v2-muted">No styles selected</p>
      )}
    </div>
  )
}
