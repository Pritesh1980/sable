import { useState } from 'react'
import Logo from '../components/Logo'
import { GUIDE_BASE, HELP_GROUPS, guideUrl } from '../data/helpTopics'

// On-device quick help (#220 I): a How-do-I list with short answers. The full,
// screenshot-rich guide is docs/ on GitHub; each answer links to its part of it.
// Screenshots are served from public/guide/ (the same image set the docs use).

function Topic({ topic, open, onToggle }) {
  const panelId = `help-${topic.id}`
  return (
    <li className="border-b border-ink-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full min-h-11 flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-ink-muted transition-colors"
      >
        <span className="font-body text-cream text-[15px] leading-snug">{topic.question}</span>
        <span aria-hidden="true" className={`text-cream-muted/60 text-xs transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div id={panelId} className="px-4 pb-4 animate-slide-up">
          <ol aria-label={`Steps: ${topic.question}`} className="space-y-2 mb-3">
            {topic.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm font-body text-cream-muted leading-relaxed">
                <span className="font-mono text-accent/80 text-xs tabular-nums mt-0.5 shrink-0">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <a
            href={guideUrl(topic.guide)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center font-body text-sm text-accent hover:text-cream transition-colors"
          >
            More in the full guide ↗
          </a>
          {topic.image && (
            <div className="w-fit max-w-full rounded-xs overflow-hidden border border-ink-border bg-ink-muted mt-2">
              <img
                src={`${import.meta.env.BASE_URL}guide/${topic.image}`}
                alt={topic.question}
                loading="lazy"
                className="block max-w-full max-h-[60vh] w-auto"
                onError={(e) => { e.currentTarget.parentElement.style.display = 'none' }}
              />
            </div>
          )}
        </div>
      )}
    </li>
  )
}

export default function Help() {
  const [open, setOpen] = useState(() => new Set())

  function toggle(id) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-ink-black max-w-3xl mx-auto px-4 md:px-8 pt-safe-top pb-24">
      <div className="pt-12 pb-6">
        <Logo size={24} className="mb-2" />
        <h1 className="font-display text-3xl text-cream">How to use Sable</h1>
        <p className="font-body text-cream-muted/80 text-sm mt-2 leading-relaxed max-w-prose">
          Tap a question for a short answer. Everything else is in the{' '}
          <a
            href={`${GUIDE_BASE}README.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 hover:text-cream transition-colors"
          >
            full guide ↗
          </a>
          .
        </p>
      </div>

      <div className="space-y-6">
        {HELP_GROUPS.map((group) => (
          <section key={group.label} aria-labelledby={`help-group-${group.label}`}>
            <h2
              id={`help-group-${group.label}`}
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-cream-muted/70 mb-2"
            >
              {group.label}
            </h2>
            <ul className="bg-ink-card border border-ink-border rounded-xs overflow-hidden">
              {group.topics.map((topic) => (
                <Topic
                  key={topic.id}
                  topic={topic}
                  open={open.has(topic.id)}
                  onToggle={() => toggle(topic.id)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
