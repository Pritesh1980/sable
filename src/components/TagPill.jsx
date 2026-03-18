export default function TagPill({ tag, active, onClick, small }) {
  const base = small
    ? 'text-[9px] px-1.5 py-0.5'
    : 'text-[10px] px-2 py-1'

  return (
    <button
      onClick={onClick}
      className={`${base} rounded-sm border font-mono tracking-widest uppercase transition-colors duration-150 ${
        active
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-ink-border text-cream-muted hover:border-cream-muted hover:text-cream'
      } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {tag}
    </button>
  )
}
