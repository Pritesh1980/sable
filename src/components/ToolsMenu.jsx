import { useEffect, useId, useRef, useState } from 'react'

// The Artists header's "Tools" menu (#220, group E). Not "More": the app nav
// already has a More, and two controls with one name on one screen is the
// problem this group set out to remove. Five text buttons in a row
// told the owner nothing about what each did, so the tools sit behind one
// button and every item carries a line of explanation.
export default function ToolsMenu({ tools, disabled = false }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (open) menuRef.current?.querySelector('[role="menuitem"]')?.focus()
  }, [open])

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      // Claimed, so a layer underneath does not also close (useDialogFocus).
      e.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...menuRef.current.querySelectorAll('[role="menuitem"]')]
    const at = items.indexOf(document.activeElement)
    const next = (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }

  return (
    // Focus leaving the trigger and the menu closes it, so its backdrop never
    // outlives it (codex).
    <div
      className="relative"
      onBlur={(e) => { if (open && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false) }}
    >
      <button
        ref={buttonRef}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (open && e.key === 'Escape') { e.preventDefault(); setOpen(false) } }}
        className={`font-mono text-xs px-3 min-h-11 rounded-xs transition-colors tracking-widest uppercase border disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${
          open ? 'text-cream border-cream-muted' : 'text-cream-muted hover:text-cream border-ink-border hover:border-cream-muted'
        }`}
      >
        Tools<span aria-hidden="true"> ▾</span>
      </button>
      {open && (
        <>
          {/* Tap-outside catcher; Escape closes it too. */}
          <div role="presentation" className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            ref={menuRef}
            id={id}
            role="menu"
            aria-label="Tools"
            onKeyDown={onKeyDown}
            className="absolute right-0 top-full z-40 mt-1 w-64 max-w-[calc(100vw-2rem)] bg-ink-card border border-ink-border rounded-xs shadow-2xl shadow-black/70 py-1"
          >
            {tools.map((tool, i) => (
              <button
                key={tool.label}
                role="menuitem"
                aria-label={tool.label}
                aria-describedby={`${id}-hint-${i}`}
                // Focus goes back to the trigger first: a dialog the tool opens
                // records it as the place to return to (codex).
                onClick={() => { buttonRef.current?.focus(); setOpen(false); tool.onSelect() }}
                className="w-full text-left px-4 py-2.5 min-h-11 hover:bg-ink-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent transition-colors"
              >
                <span className="block font-mono text-xs text-cream tracking-widest uppercase">{tool.label}</span>
                <span id={`${id}-hint-${i}`} className="block font-body text-xs text-cream-muted mt-0.5">{tool.hint}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
