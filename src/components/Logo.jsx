// Inline SVG koru mark — inherits colour via currentColor.
export function LogoMark({ size = 32, className = '' }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M 4 24 Q 4 4 24 4 Q 44 4 44 24 Q 44 40 28 40 Q 14 40 14 28 Q 14 18 24 18 Q 30 18 30 24" />
      <circle cx="30" cy="24" r="3" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Wordmark-only component for reuse if needed.
export function Wordmark({ className = '' }) {
  return (
    <span className={`font-display tracking-[0.35em] text-sm uppercase ${className}`}>
      Tattoo
    </span>
  )
}

// Full lockup: mark + wordmark, used in page headers.
export default function Logo({ size = 28, className = '' }) {
  return (
    <div className={`inline-flex items-center gap-2 text-cream ${className}`}>
      <LogoMark size={size} />
      <Wordmark />
    </div>
  )
}
