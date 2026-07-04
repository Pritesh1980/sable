// WebGL crossfade engine for the full-screen viewer. Kept framework-free and
// dependency-injected (three.js is passed in) so it can be unit-tested with a
// mock THREE — the component (src/components/GlCrossfade.jsx) dynamic-imports
// three and hands it here, keeping three out of the main bundle.
//
// One fullscreen plane, two textures, an eased `uProgress` uniform. The plane's
// vertex positions are used directly as clip-space coordinates (no camera
// matrices), so the shader stays short. Aspect is handled by a `contain` helper
// that letterboxes to transparent, so the ink background shows through and the
// artwork is never cropped — a subtle radial ripple is the only flourish.

const VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform float uProgress;
uniform vec2 uViewport;
uniform vec2 uFromRes;
uniform vec2 uToRes;

// Fit an image inside the viewport (letterbox) and report whether the sampled
// point falls inside the image rect (1.0) or in the letterbox bars (0.0).
vec2 contain(vec2 uv, vec2 res, out float inside) {
  float va = uViewport.x / max(uViewport.y, 1.0);
  float ia = res.x / max(res.y, 1.0);
  vec2 s = va > ia ? vec2(va / ia, 1.0) : vec2(1.0, ia / va);
  vec2 p = (uv - 0.5) * s + 0.5;
  inside = step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0);
  return p;
}

vec4 sampleImage(sampler2D tex, vec2 uv, vec2 res) {
  float inside;
  vec2 p = contain(uv, res, inside);
  return texture2D(tex, p) * inside;
}

void main() {
  // A soft radial ripple: zero at both endpoints, peaking mid-transition.
  vec2 c = vUv - 0.5;
  float d = length(c);
  float amp = 0.018 * sin(uProgress * 3.14159265);
  vec2 disp = normalize(c + 1e-5) * sin(d * 22.0 - uProgress * 9.0) * amp;

  float t = smoothstep(0.0, 1.0, uProgress);
  vec4 from = sampleImage(uFrom, vUv + disp, uFromRes);
  vec4 to = sampleImage(uTo, vUv + disp, uToRes);
  gl_FragColor = mix(from, to, t);
}
`

// Create the engine. `THREE` is injected. Returns null if a WebGL renderer
// can't be constructed (caller should fall back to the CSS/img path). The
// returned handle exposes setImage (immediate), transitionTo (animated),
// resize and dispose.
export function createGlEngine(THREE, mount, { durationMs = 600, onContextLost } = {}) {
  const width = mount.clientWidth || 1
  const height = mount.clientHeight || 1

  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: false })
  } catch {
    return null
  }

  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
  renderer.setPixelRatio?.(Math.min(dpr, 2))
  renderer.setSize?.(width, height)
  renderer.setClearColor?.(0x000000, 0)

  const canvas = renderer.domElement
  if (canvas?.style) {
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
  }
  mount.appendChild(canvas)

  const scene = new THREE.Scene()
  const camera = new THREE.Camera()
  const geometry = new THREE.PlaneGeometry(2, 2)

  const uniforms = {
    uFrom: { value: null },
    uTo: { value: null },
    uProgress: { value: 1 },
    uViewport: { value: new THREE.Vector2(width, height) },
    uFromRes: { value: new THREE.Vector2(1, 1) },
    uToRes: { value: new THREE.Vector2(1, 1) },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
  })
  const mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh)

  const loader = new THREE.TextureLoader()
  loader.setCrossOrigin?.('anonymous')

  let raf = 0
  let startTs = 0
  let animating = false
  let currentTex = null // the settled, displayed texture
  let fromTex = null
  let toTex = null
  let loadToken = 0
  let disposed = false

  function renderOnce() {
    if (!disposed) renderer.render?.(scene, camera)
  }

  function configureTexture(tex) {
    if (!tex) return tex
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  function texRes(tex) {
    const img = tex && tex.image
    return [(img && img.width) || 1, (img && img.height) || 1]
  }

  // Load a texture from any URL three understands: http(s), blob:, data:.
  function load(src) {
    return new Promise((resolve) => {
      if (!src) {
        resolve(null)
        return
      }
      loader.load(
        src,
        (tex) => resolve(configureTexture(tex)),
        undefined,
        () => resolve(null), // keep whatever is showing on load failure
      )
    })
  }

  function tick(ts) {
    if (disposed) return
    if (!startTs) startTs = ts
    const p = Math.min(1, (ts - startTs) / durationMs)
    uniforms.uProgress.value = p
    renderOnce()
    if (p < 1) {
      raf = requestAnimationFrame(tick)
      return
    }
    animating = false
    // Adopt the destination as the new settled texture; retire the old source.
    if (fromTex && fromTex !== toTex && fromTex !== currentTex) fromTex.dispose?.()
    currentTex = toTex
    fromTex = toTex
    uniforms.uFrom.value = toTex
    uniforms.uFromRes.value.set(...texRes(toTex))
    uniforms.uProgress.value = 1
    renderOnce()
  }

  // Show an image immediately with no animation (used for the first image).
  function setImage(src) {
    loadToken += 1
    const token = loadToken
    load(src).then((tex) => {
      if (disposed || token !== loadToken) {
        tex?.dispose?.()
        return
      }
      if (currentTex && currentTex !== tex) currentTex.dispose?.()
      currentTex = tex
      fromTex = tex
      toTex = tex
      uniforms.uFrom.value = tex
      uniforms.uTo.value = tex
      uniforms.uFromRes.value.set(...texRes(tex))
      uniforms.uToRes.value.set(...texRes(tex))
      uniforms.uProgress.value = 1
      renderOnce()
    })
  }

  // Animate a crossfade from the current image to `src`.
  function transitionTo(src) {
    loadToken += 1
    const token = loadToken
    load(src).then((tex) => {
      if (disposed || token !== loadToken) {
        tex?.dispose?.()
        return
      }
      // If a transition is still mid-flight, snap it to done first so we never
      // leak the in-between source texture.
      if (animating) {
        cancelAnimationFrame(raf)
        animating = false
        if (fromTex && fromTex !== toTex && fromTex !== currentTex) fromTex.dispose?.()
        currentTex = toTex
      }
      fromTex = currentTex
      toTex = tex
      uniforms.uFrom.value = fromTex
      uniforms.uTo.value = toTex
      uniforms.uFromRes.value.set(...texRes(fromTex))
      uniforms.uToRes.value.set(...texRes(toTex))
      uniforms.uProgress.value = 0
      startTs = 0
      animating = true
      raf = requestAnimationFrame(tick)
    })
  }

  function resize() {
    if (disposed) return
    const w = mount.clientWidth || width
    const h = mount.clientHeight || height
    renderer.setSize?.(w, h)
    uniforms.uViewport.value.set(w, h)
    renderOnce()
  }

  const handleContextLost = (event) => {
    event?.preventDefault?.()
    onContextLost?.()
  }
  canvas?.addEventListener?.('webglcontextlost', handleContextLost, false)

  let ro = null
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(resize)
    ro.observe(mount)
  }

  function dispose() {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(raf)
    ro?.disconnect?.()
    canvas?.removeEventListener?.('webglcontextlost', handleContextLost, false)
    geometry.dispose?.()
    material.dispose?.()
    new Set([currentTex, fromTex, toTex].filter(Boolean)).forEach((t) => t.dispose?.())
    renderer.forceContextLoss?.()
    renderer.dispose?.()
    if (canvas && canvas.parentNode === mount) mount.removeChild(canvas)
  }

  return { setImage, transitionTo, resize, dispose }
}
