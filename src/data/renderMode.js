// Decides whether the Top 5 hero renders the three.js coverflow or the static
// fallback. Kept dependency-injected so the decision is unit-testable without a
// real DOM: the browser-reading bits take overridable factories.

// Pure policy: WebGL is only worth loading when it's supported AND the user
// hasn't asked for reduced motion. Either miss → static fallback.
export function selectRenderMode({ webglSupported, reducedMotion }) {
  return webglSupported && !reducedMotion ? 'webgl' : 'static'
}

// Probe for a WebGL context. `createCanvas` is injected for tests; defaults to
// a real detached canvas. Any failure (no context, or a throw) means no WebGL.
export function detectWebGL(createCanvas = () => document.createElement('canvas')) {
  try {
    const canvas = createCanvas()
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    return !!gl
  } catch {
    return false
  }
}

// Read the reduced-motion preference. `matchMedia` is injected for tests;
// defaults to the global. Absent matchMedia (old/SSR) → treat as no preference.
export function prefersReducedMotion(
  matchMedia = typeof window !== 'undefined' ? window.matchMedia : undefined
) {
  if (typeof matchMedia !== 'function') return false
  return !!matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Convenience: resolve the mode from the live environment.
export function resolveRenderMode() {
  return selectRenderMode({
    webglSupported: detectWebGL(),
    reducedMotion: prefersReducedMotion(),
  })
}
