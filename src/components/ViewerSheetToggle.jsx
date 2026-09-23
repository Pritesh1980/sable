// The visible way to open/close a touch viewer's control sheet (#93). A tap on
// the image does the same, but screen readers activate with a synthesized
// click that never reaches the gesture surface, and a first-time user needs
// something to see.
export default function ViewerSheetToggle({ open, onToggle, controls, className = '' }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? 'Hide controls' : 'Show controls'}
      aria-expanded={open}
      aria-controls={controls}
      className={`flex flex-col items-center gap-1 px-6 py-2 text-v2-muted pointer-events-auto ${className}`}
    >
      <span aria-hidden="true" className="block w-10 h-1 rounded-full bg-v2-muted" />
      {!open && <span aria-hidden="true" className="font-v2-ui text-[0.62rem] tracking-[0.2em] uppercase">Details</span>}
    </button>
  )
}
