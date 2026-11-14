import { Link } from 'react-router'
import { Plus } from 'lucide-react'

// What an empty page or row shows (#220, group C): one sentence saying what the
// thing is, then one way to start. `to` makes the action a link, `onClick` a
// button. `tone="v2"` is for the fixed-dark pages (AI concepts).
const TONES = {
  themed: {
    box: 'border-ink-border',
    text: 'font-body text-cream-muted',
    action: 'border-accent/50 hover:border-accent text-accent hover:text-cream font-mono text-xs tracking-widest uppercase',
  },
  v2: {
    box: 'border-v2-hairline',
    text: 'font-v2-ui text-v2-muted',
    action: 'border-v2-hairline hover:border-v2-accent text-v2-cream font-v2-ui text-sm',
  },
}

export default function EmptyState({ definition, to, onClick, cta, tone = 'themed', className = '', children }) {
  const t = TONES[tone]
  const actionClass = `inline-flex items-center gap-2 min-h-11 mt-4 px-4 border rounded-xs transition-colors ${t.action}`
  const label = <><Plus size={14} aria-hidden="true" />{cta}</>
  return (
    <div className={`border border-dashed rounded-xs px-5 py-6 ${t.box} ${className}`}>
      <p className={`text-sm leading-relaxed max-w-prose ${t.text}`}>{definition}</p>
      {to
        ? <Link to={to} className={actionClass}>{label}</Link>
        : <button type="button" onClick={onClick} className={actionClass}>{label}</button>}
      {children}
    </div>
  )
}
