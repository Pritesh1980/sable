export default function TagPill({ tag, active, onClick, small, disabled = false }) {
  const base = small
    ? 'text-[0.8125rem] px-1.5 py-0.5'
    : 'text-xs px-2 py-1'

  const className = `${base} inline-block rounded-xs border font-mono tracking-widest uppercase transition-colors duration-150 ${
    active
      ? 'border-accent bg-accent/10 text-accent'
      : 'border-ink-border text-cream-muted hover:border-cream-muted hover:text-cream'
  } ${onClick ? 'cursor-pointer' : 'cursor-default'} disabled:opacity-40 disabled:cursor-not-allowed`

  // Decorative pills (no onClick) render as a span so they can sit inside
  // clickable cards without nesting a <button> in a <button> (invalid HTML).
  if (!onClick) {
    return <span className={className}>{tag}</span>
  }

  return (
    <button onClick={onClick} disabled={disabled} className={className}>
      {tag}
    </button>
  )
}
