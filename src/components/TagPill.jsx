export default function TagPill({ tag, active, onClick, small }) {
  const base = small
    ? 'text-[0.8125rem] px-1.5 py-0.5'
    : 'text-xs px-2 py-1'

  const className = `${base} inline-block rounded-sm border font-mono tracking-widest uppercase transition-colors duration-150 ${
    active
      ? 'border-accent bg-accent/10 text-accent'
      : 'border-ink-border text-cream-muted hover:border-cream-muted hover:text-cream'
  } ${onClick ? 'cursor-pointer' : 'cursor-default'}`

  // Decorative pills (no onClick) render as a span so they can sit inside
  // clickable cards without nesting a <button> in a <button> (invalid HTML).
  if (!onClick) {
    return <span className={className}>{tag}</span>
  }

  return (
    <button onClick={onClick} className={className}>
      {tag}
    </button>
  )
}
