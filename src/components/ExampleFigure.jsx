// A faded, labelled picture of what a filled page looks like (#220, group C).
// It is an illustration, not data: nothing inside is a control and nothing is
// saved, so it disappears as soon as the owner adds something real.
export default function ExampleFigure({ tone = 'themed', className = '', children }) {
  const v2 = tone === 'v2'
  return (
    <figure aria-label="Example" className={`max-w-md ${className}`}>
      <figcaption className={`mb-2 text-[0.6875rem] tracking-[0.3em] uppercase ${v2 ? 'font-v2-ui text-v2-muted' : 'font-mono text-cream-muted'}`}>
        Example · not saved
      </figcaption>
      <div className={`border border-dashed rounded-xs p-1.5 opacity-70 select-none ${v2 ? 'border-v2-hairline' : 'border-ink-border'}`}>
        {children}
      </div>
    </figure>
  )
}
