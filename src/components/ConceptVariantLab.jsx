import { useMemo, useState } from 'react'
import {
  RESULT_VARIANT_PROVIDERS,
  getConceptVariants,
  getProviderLabel,
  sortConceptVariants,
} from '../data/conceptVariants'

const EMPTY_FORM = {
  provider: 'chatgpt',
  title: '',
  imageUrl: '',
  response: '',
  notes: '',
  rating: 0,
}

const RATINGS = [0, 1, 2, 3, 4, 5]

function resultTitle(variant) {
  return safeText(variant.title) || 'Untitled result'
}

function resultActionLabel(variant) {
  const title = resultTitle(variant)
  return title === 'Untitled result' ? title : `${title} result`
}

function conceptLabel(concept) {
  return safeText(concept?.prompt) || safeText(concept?.id) || 'this concept'
}

function resultCountLabel(count) {
  return `${count} ${count === 1 ? 'result' : 'results'}`
}

function ratingLabel(rating) {
  const normalised = normaliseRating(rating)
  return normalised > 0 ? `${normalised}/5` : 'Unrated'
}

function safeText(value) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function normaliseRating(value) {
  const rating = Number.parseInt(value, 10)
  if (Number.isNaN(rating)) return 0
  return Math.max(0, Math.min(5, rating))
}

function imageSource(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function formatCreatedDate(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return 'Date unknown'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unknown'

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function textInputClass() {
  return 'w-full rounded-sm border border-ink-border bg-ink-muted px-3 py-2 text-sm text-cream outline-none transition-colors placeholder:text-cream-muted/50 focus:border-cream-muted/50'
}

function FieldLabel({ children }) {
  return (
    <span className="mb-1 block font-mono text-[0.625rem] uppercase tracking-widest text-cream-muted/60">
      {children}
    </span>
  )
}

function RatingButtons({ value, onChange, labelPrefix = 'Rating' }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {RATINGS.map((rating) => (
        <button
          key={rating}
          type="button"
          aria-label={`${labelPrefix} ${rating}`}
          onClick={() => onChange(rating)}
          className={`h-8 min-w-8 rounded-sm border px-2 font-mono text-[0.6875rem] transition-colors ${
            normaliseRating(value) === rating
              ? 'border-accent/70 bg-accent/15 text-accent'
              : 'border-ink-border text-cream-muted hover:border-cream-muted/50 hover:text-cream'
          }`}
        >
          {rating}
        </button>
      ))}
    </div>
  )
}

function AddVariantForm({ conceptId, label, onAddVariant, onCancel }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [dragOver, setDragOver] = useState(false)

  const hasContent = Boolean(
    form.imageUrl.trim() || form.response.trim() || form.notes.trim()
  )

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function handleFile(file) {
    if (!file || !file.type?.startsWith('image/')) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target?.result
      if (typeof result === 'string') {
        update('imageUrl', result)
      }
    }
    reader.readAsDataURL(file)
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragOver(false)

    const files = Array.from(event.dataTransfer.files || [])
    const imageFile = files.find((file) => file.type?.startsWith('image/'))
    if (imageFile) {
      handleFile(imageFile)
      return
    }
    if (files.length > 0) return

    const url = (
      event.dataTransfer.getData('text/uri-list') ||
      event.dataTransfer.getData('text/plain')
    ).trim()
    if (url.startsWith('http')) update('imageUrl', url)
  }

  function save() {
    if (!hasContent) return

    onAddVariant(conceptId, {
      provider: form.provider,
      title: form.title.trim(),
      imageUrl: form.imageUrl.trim(),
      response: form.response.trim(),
      notes: form.notes.trim(),
      rating: Number(form.rating),
    })
    setForm(EMPTY_FORM)
    onCancel()
  }

  return (
    <div className="mt-4 space-y-4 rounded-sm border border-ink-border bg-ink-black/35 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <FieldLabel>Provider</FieldLabel>
          <select
            aria-label="Provider"
            className={textInputClass()}
            value={form.provider}
            onChange={(event) => update('provider', event.target.value)}
          >
            {RESULT_VARIANT_PROVIDERS.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <FieldLabel>Title</FieldLabel>
          <input
            aria-label="Title"
            className={textInputClass()}
            value={form.title}
            onChange={(event) => update('title', event.target.value)}
            placeholder="Short label for this result"
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="block">
          <FieldLabel>Image URL</FieldLabel>
          <input
            aria-label="Image URL"
            className={textInputClass()}
            value={form.imageUrl}
            onChange={(event) => update('imageUrl', event.target.value)}
            placeholder="Paste a result image URL or data URL"
          />
        </label>

        <label className="block md:min-w-48">
          <FieldLabel>Image file</FieldLabel>
          <input
            aria-label="Image file"
            type="file"
            accept="image/*"
            className="block w-full cursor-pointer rounded-sm border border-dashed border-ink-border bg-ink-muted px-3 py-2 text-xs text-cream-muted file:mr-3 file:rounded-sm file:border-0 file:bg-cream/10 file:px-3 file:py-1.5 file:text-xs file:text-cream hover:border-cream-muted/40"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
        </label>
      </div>

      <div
        aria-label="Image drop zone"
        className={`rounded-sm border-2 border-dashed px-4 py-5 text-center transition-colors ${
          dragOver ? 'border-accent bg-accent/5' : 'border-ink-border bg-ink-muted/20'
        }`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted/70">
          Drop image or URL here
        </p>
        <p className="mt-1 text-xs text-cream-muted/50">
          Image files become data URLs; http links fill the image URL field.
        </p>
      </div>

      <label className="block">
        <FieldLabel>AI text</FieldLabel>
        <textarea
          aria-label="AI text"
          className={`${textInputClass()} min-h-24 resize-y`}
          value={form.response}
          onChange={(event) => update('response', event.target.value)}
          placeholder="Paste the AI response, critique, or generation notes"
        />
      </label>

      <label className="block">
        <FieldLabel>Notes</FieldLabel>
        <textarea
          aria-label="Notes"
          className={`${textInputClass()} min-h-20 resize-y`}
          value={form.notes}
          onChange={(event) => update('notes', event.target.value)}
          placeholder="Personal read on what works or needs refinement"
        />
      </label>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <FieldLabel>Rating</FieldLabel>
          <RatingButtons
            value={form.rating}
            labelPrefix={`Rating for ${label}`}
            onChange={(rating) => update('rating', rating)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-label={`Cancel result for ${label}`}
            onClick={onCancel}
            className="rounded-sm border border-ink-border px-4 py-2 text-sm text-cream-muted transition-colors hover:border-cream-muted/50 hover:text-cream"
          >
            Cancel
          </button>
          <button
            type="button"
            aria-label={`Save result for ${label}`}
            disabled={!hasContent}
            onClick={save}
            className="rounded-sm bg-accent px-4 py-2 text-sm text-cream transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-30"
          >
            Save Result
          </button>
        </div>
      </div>
    </div>
  )
}

function VariantDetails({
  conceptId,
  label,
  variant,
  onMarkBest,
  onDeleteVariant,
  onRateVariant,
}) {
  const title = resultTitle(variant)
  const actionLabel = resultActionLabel(variant)
  const imageUrl = imageSource(variant.imageUrl)
  const response = safeText(variant.response)
  const notes = safeText(variant.notes)

  return (
    <div className="border-t border-ink-border bg-ink-black/25 p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="space-y-3">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`${title} result`}
              className="aspect-[4/3] w-full rounded-sm border border-ink-border object-cover"
            />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center rounded-sm border border-dashed border-ink-border bg-ink-muted/40 text-xs text-cream-muted">
              No image saved
            </div>
          )}

          <div>
            <FieldLabel>Rating</FieldLabel>
            <RatingButtons
              value={variant.rating}
              labelPrefix={`Rate ${title} for ${label}`}
              onChange={(rating) => onRateVariant(conceptId, variant.id, rating)}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 rounded-sm border border-ink-border bg-ink-muted/20 p-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Provider</FieldLabel>
              <p className="text-sm text-cream">{getProviderLabel(variant.provider)}</p>
            </div>
            <div>
              <FieldLabel>Created</FieldLabel>
              <p className="text-sm text-cream">{formatCreatedDate(variant.createdAt)}</p>
            </div>
          </div>

          <div>
            <FieldLabel>AI text</FieldLabel>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-cream">
              {response || 'No AI text saved.'}
            </p>
          </div>

          <div>
            <FieldLabel>Notes</FieldLabel>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-cream-muted">
              {notes || 'No notes saved.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {!variant.isBest && (
              <button
                type="button"
                aria-label={`Mark ${title} as Best for ${label}`}
                onClick={() => onMarkBest(conceptId, variant.id)}
                className="rounded-sm border border-accent/45 px-3 py-2 text-xs text-accent transition-colors hover:bg-accent/10"
              >
                Mark {title} as Best
              </button>
            )}
            <button
              type="button"
              aria-label={`Delete ${actionLabel} for ${label}`}
              onClick={() => onDeleteVariant(conceptId, variant.id)}
              className="rounded-sm border border-ink-border px-3 py-2 text-xs text-cream-muted transition-colors hover:border-accent/60 hover:text-accent"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function VariantCard({
  conceptId,
  label,
  variant,
  isExpanded,
  onToggle,
  onMarkBest,
  onDeleteVariant,
  onRateVariant,
}) {
  const title = resultTitle(variant)
  const actionLabel = resultActionLabel(variant)
  const imageUrl = imageSource(variant.imageUrl)

  return (
    <article className="overflow-hidden rounded-sm border border-ink-border bg-ink-black/20">
      <button
        type="button"
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${actionLabel} for ${label}`}
        aria-expanded={isExpanded}
        aria-controls={`variant-details-${variant.id}`}
        onClick={onToggle}
        className="grid w-full gap-3 p-3 text-left transition-colors hover:bg-cream/5 sm:grid-cols-[4.5rem_minmax(0,1fr)]"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`${title} thumbnail`}
            className="h-20 w-full rounded-sm border border-ink-border object-cover sm:h-16"
          />
        ) : (
          <div className="flex h-20 w-full items-center justify-center rounded-sm border border-dashed border-ink-border bg-ink-muted/40 font-mono text-[0.625rem] uppercase tracking-widest text-cream-muted/50 sm:h-16">
            No image
          </div>
        )}

        <span className="min-w-0 space-y-2">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[0.625rem] uppercase tracking-widest text-accent">
              {getProviderLabel(variant.provider)}
            </span>
            <span className="font-mono text-[0.625rem] uppercase tracking-widest text-cream-muted/60">
              {ratingLabel(variant.rating)}
            </span>
            {variant.isBest && (
              <span className="rounded-sm border border-accent-gold/50 bg-accent-gold/10 px-2 py-0.5 font-mono text-[0.625rem] uppercase tracking-widest text-accent-gold">
                Best
              </span>
            )}
          </span>
          <span className="block truncate font-display text-lg leading-tight text-cream">
            {title}
          </span>
        </span>
      </button>

      {isExpanded && (
        <div id={`variant-details-${variant.id}`}>
          <VariantDetails
            conceptId={conceptId}
            label={label}
            variant={variant}
            onMarkBest={onMarkBest}
            onDeleteVariant={onDeleteVariant}
            onRateVariant={onRateVariant}
          />
        </div>
      )}
    </article>
  )
}

export default function ConceptVariantLab({
  concept,
  onAddVariant,
  onMarkBest,
  onDeleteVariant,
  onRateVariant,
}) {
  const [isAdding, setIsAdding] = useState(false)
  const [expandedVariantId, setExpandedVariantId] = useState('')

  const variants = useMemo(
    () => sortConceptVariants(getConceptVariants(concept)),
    [concept]
  )
  const label = conceptLabel(concept)

  return (
    <section className="mt-5 rounded-sm border border-ink-border bg-ink-card/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-1 font-mono text-[0.625rem] uppercase tracking-[0.3em] text-accent">
            Curated outputs
          </p>
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="font-display text-2xl leading-none text-cream">AI Results</h3>
            <span className="font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted/60">
              {resultCountLabel(variants.length)}
            </span>
          </div>
        </div>

        {!isAdding && (
          <button
            type="button"
            aria-label={`Add result to ${label}`}
            onClick={() => setIsAdding(true)}
            className="rounded-sm bg-accent px-4 py-2 text-sm text-cream transition-colors hover:bg-accent-hover"
          >
            Add Result
          </button>
        )}
      </div>

      {isAdding && (
        <AddVariantForm
          conceptId={concept.id}
          label={label}
          onAddVariant={onAddVariant}
          onCancel={() => setIsAdding(false)}
        />
      )}

      <div className="mt-4 space-y-2">
        {variants.length === 0 ? (
          <p className="rounded-sm border border-dashed border-ink-border bg-ink-black/20 px-3 py-4 text-sm text-cream-muted">
            Save external AI images, responses, and notes here when a concept starts to take shape.
          </p>
        ) : (
          variants.map((variant) => (
            <VariantCard
              key={variant.id}
              conceptId={concept.id}
              label={label}
              variant={variant}
              isExpanded={expandedVariantId === variant.id}
              onToggle={() => {
                setExpandedVariantId((current) => (
                  current === variant.id ? '' : variant.id
                ))
              }}
              onMarkBest={onMarkBest}
              onDeleteVariant={onDeleteVariant}
              onRateVariant={onRateVariant}
            />
          ))
        )}
      </div>
    </section>
  )
}
