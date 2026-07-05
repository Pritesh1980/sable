// Feature-detects WebGL support and resolves whether page transitions should
// use the WebGL renderer or fall back to CSS. Kept dependency-injected so the
// decision is unit-testable without a real DOM/browser.

// Probe for a WebGL2 or WebGL1 context. `createCanvas` is injected for tests;
// defaults to a real detached canvas. Any failure (no context, or a throw)
// means WebGL is unavailable.
export function canUseGL(createCanvas = () => document.createElement('canvas')) {
  try {
    const canvas = createCanvas()
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    return !!gl
  } catch {
    return false
  }
}

// Resolve whether transitions should run in 'webgl' or 'css' mode. Falls back
// to 'css' when explicitly overridden (?gl=off, tattoo_gl_override=off),
// reduced motion is preferred, or WebGL isn't supported.
export function resolveTransitionMode({
  location = typeof window !== 'undefined' ? window.location : { search: '' },
  storage = typeof window !== 'undefined' ? window.localStorage : { getItem: () => null },
  matchMedia = typeof window !== 'undefined' ? window.matchMedia : undefined,
  canUseGL: canUseGLDep = canUseGL,
} = {}) {
  const params = new URLSearchParams(location.search || '')
  if (params.get('gl') === 'off') return 'css'
  if (storage.getItem('tattoo_gl_override') === 'off') return 'css'
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return 'css'
  }
  if (!canUseGLDep()) return 'css'
  return 'webgl'
}
