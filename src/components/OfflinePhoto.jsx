// Stands in for a saved photo whose bytes can't be fetched right now (#102).
// The photo is still in the user's data; it just needs a connection to show.
export default function OfflinePhoto({ className = '', compact = false }) {
  return (
    <div
      role="img"
      aria-label="Photo available when online"
      className={`flex flex-col items-center justify-center gap-2 bg-ink-muted/60 text-cream-muted/70 ${className}`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className={compact ? 'w-4 h-4' : 'w-7 h-7'} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 2l20 20" />
        <path d="M5.8 9.6A5 5 0 0 0 7 19h10.5" />
        <path d="M21.4 16.6A4 4 0 0 0 17.5 10H16a7 7 0 0 0-7.4-4.9" />
      </svg>
      {!compact && (
        <span className="font-mono text-[0.625rem] tracking-widest uppercase">Available when online</span>
      )}
    </div>
  )
}
