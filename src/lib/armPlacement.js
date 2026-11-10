// WebGL engine for the 3D placement view (#195 spike): a design on a 3D upper
// arm at true size. Framework-free and dependency-injected (three.js and its
// glTF loader are passed in), like glCrossfade.js, so it is unit tested with a
// mock THREE; ArmPlacement3D.jsx hands it the real one from a lazy chunk.
//
// The arm model already knows where every vertex is on the skin in cm
// (scripts/blender/export-arm-gltf.py): TEXCOORD_0 is (arc round the arm,
// circumference there) and TEXCOORD_1.x fades the cut edges out. Placing the
// design is therefore four uniforms and one texture read per pixel: no decal
// geometry, no projection, nothing rebuilt while a finger moves.

import { pinchWidth, toInkPixels, viewFrame, designYaw, WHOLE_ARM } from '../data/placement3d'

const BACKDROP = 0x131110 // v2-ink
const SKIN = 0x9a7654 // render-on-body.py's default tone, warm-brown
export const MAX_TEXTURE_PX = 1024
const TILT_LIMIT = 0.45
const DRAG_SPEED = 0.008
const SPIN_SPEED = 0.012
const EASE = 0.18 // share of the way to the new framing covered each frame
// Half the arm's width in metres, with room: the least the view shows across.
const HALF_ARM_M = 0.075
// A little towards the front to start with, so the arm reads as round.
const OPENING_TURN = -0.3

const VERTEX = /* glsl */ `
  attribute vec2 uv1;
  varying vec2 vSurface;
  varying float vFade;
  varying float vHeightCm;
  varying vec3 vNormal;
  varying vec3 vToEye;
  void main() {
    vSurface = uv;
    vFade = uv1.x;
    vHeightCm = position.y * 100.0;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalMatrix * normal;
    vToEye = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`

const FRAGMENT = /* glsl */ `
  uniform sampler2D uDesign;
  uniform vec4 uPlace; // arc cm, centre cm, width cm, height cm
  uniform vec3 uSkin;
  uniform vec3 uBackdrop;
  varying vec2 vSurface;
  varying float vFade;
  varying float vHeightCm;
  varying vec3 vNormal;
  varying vec3 vToEye;

  // Healed black ink is a cool, slightly lifted black, never #000.
  const vec3 INK_FLOOR = vec3(0.055, 0.07, 0.085);

  void main() {
    if (vFade < 0.02) discard;
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vToEye);

    // The design, as ink: the texture multiplies the skin, white is bare skin.
    float turn = vSurface.y;
    float arc = vSurface.x - uPlace.x;
    arc -= turn * floor(arc / max(turn, 1.0) + 0.5); // shortest way round
    vec2 st = vec2(arc / uPlace.z, (vHeightCm - uPlace.y) / uPlace.w) + 0.5;
    vec3 paper = texture2D(uDesign, clamp(st, 0.0, 1.0)).rgb;
    vec2 edge = smoothstep(vec2(0.0), vec2(0.01), st) * smoothstep(vec2(0.0), vec2(0.01), 1.0 - st);
    float inked = edge.x * edge.y * step(1.0, turn);
    vec3 skin = uSkin * mix(vec3(1.0), mix(INK_FLOOR, vec3(1.0), paper), inked);

    // Soft studio light in view space: a wrapped key from the upper left, a
    // dim fill, and a rim that lifts the silhouette off the near-black.
    float key = dot(n, normalize(vec3(-0.45, 0.55, 0.7))) * 0.5 + 0.5;
    float fill = max(dot(n, normalize(vec3(0.8, -0.1, 0.4))), 0.0);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 h = normalize(normalize(vec3(-0.45, 0.55, 0.7)) + v);
    float sheen = pow(max(dot(n, h), 0.0), 24.0);
    vec3 colour = skin * (0.10 + 1.0 * key * key + 0.18 * fill)
      + vec3(1.0, 0.93, 0.85) * (0.05 * sheen + 0.10 * rim * key);

    gl_FragColor = vec4(mix(uBackdrop, colour, smoothstep(0.02, 1.0, vFade)), 1.0);
    #include <colorspace_fragment>
  }
`

// The image as an ink canvas: light paper, dark lines, whatever it started as
// (see toInkPixels), no larger than the texture needs to be.
export function loadDesign(src, {
  createImage = () => new Image(),
  createCanvas = () => document.createElement('canvas'),
} = {}) {
  return new Promise((resolve, reject) => {
    const image = createImage()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      const scale = Math.min(1, MAX_TEXTURE_PX / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = createCanvas()
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
      data.data.set(toInkPixels(data.data, canvas.width, canvas.height))
      ctx.putImageData(data, 0, 0)
      resolve(canvas)
    }
    image.onerror = () => reject(new Error('The design image could not be loaded.'))
    image.src = src
  })
}

// `callbacks` is read at call time ({ onResize, onReady, onError }), so the
// owner can swap handlers without rebuilding the scene.
export function createArmEngine(THREE, GLTFLoader, mount, { modelUrl, callbacks = {} }) {
  let disposed = false
  let frame = 0
  let dirty = true
  let geometry = null
  let texture = null
  let widthCm = 0
  let spin = false
  // `now` eases towards `goal`: what the camera frames, and how far the arm is
  // turned to keep the design facing it. `turned` is the user's own drag.
  let goal = { ...WHOLE_ARM, yaw: 0 }
  let now = null
  let turned = OPENING_TURN

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2))
  renderer.setClearColor(BACKDROP, 1)
  const canvas = renderer.domElement
  canvas.style.touchAction = 'none'
  canvas.style.display = 'block'
  canvas.setAttribute('aria-hidden', 'true')
  mount.appendChild(canvas)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 10)
  const tilt = new THREE.Group()
  const pivot = new THREE.Group()
  const lift = new THREE.Group() // slides the arm so the focus sits at the origin
  pivot.add(lift)
  tilt.add(pivot)
  scene.add(tilt)

  const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
  blank.needsUpdate = true
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uDesign: { value: blank },
      uPlace: { value: new THREE.Vector4(0, 17, 12, 12) },
      uSkin: { value: new THREE.Color(SKIN) },
      uBackdrop: { value: new THREE.Color(BACKDROP) },
    },
  })

  const invalidate = () => { dirty = true }

  const frameCamera = () => {
    lift.position.y = -now.focusCm / 100
    pivot.rotation.y = now.yaw + turned
    // Fit the framed height, but never crop the arm's own width.
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    camera.position.set(0, 0, Math.max(now.frameCm / 200 / half, HALF_ARM_M / (half * camera.aspect)))
  }
  // Returns true while there is further to go.
  const ease = () => {
    if (!now) { now = { ...goal }; return false }
    let moving = false
    for (const key of ['focusCm', 'frameCm', 'yaw']) {
      const gap = goal[key] - now[key]
      if (Math.abs(gap) < 0.002) now[key] = goal[key]
      else { now[key] += gap * EASE; moving = true }
    }
    return moving
  }

  const resize = () => {
    const width = mount.clientWidth || 320
    const height = mount.clientHeight || 420
    renderer.setSize(width, height, false)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    invalidate()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(mount)
  resize()

  // Renders only when something changed: an idle view costs no battery.
  const loop = () => {
    frame = requestAnimationFrame(loop)
    if (spin) { turned += SPIN_SPEED; dirty = true }
    if (!dirty) return
    dirty = ease()
    frameCamera()
    renderer.render(scene, camera)
  }
  frame = requestAnimationFrame(loop)

  new GLTFLoader().load(modelUrl, (gltf) => {
    let source = null
    gltf.scene.traverse((node) => { if (node.isMesh && !source) source = node })
    if (disposed || !source) { source?.geometry.dispose(); return }
    geometry = source.geometry
    lift.add(new THREE.Mesh(geometry, material))
    invalidate()
    callbacks.onReady?.({ triangles: geometry.index ? geometry.index.count / 3 : 0 })
  }, undefined, () => {
    if (!disposed) callbacks.onError?.(new Error('The arm model could not be loaded.'))
  })

  // One finger turns the arm; two resize the design.
  const pointers = new Map()
  let pinch = null
  const spread = () => {
    const [a, b] = [...pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }
  const onDown = (e) => {
    canvas.setPointerCapture?.(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    pinch = pointers.size === 2 ? { distance: spread(), widthCm } : null
  }
  const onMove = (e) => {
    const last = pointers.get(e.pointerId)
    if (!last) return
    const next = { x: e.clientX, y: e.clientY }
    pointers.set(e.pointerId, next)
    if (pinch && pointers.size === 2) {
      callbacks.onResize?.(pinchWidth(pinch.widthCm, pinch.distance, spread()))
    } else if (pointers.size === 1) {
      turned += (next.x - last.x) * DRAG_SPEED
      tilt.rotation.x = THREE.MathUtils.clamp(
        tilt.rotation.x + (next.y - last.y) * DRAG_SPEED * 0.5, -TILT_LIMIT, TILT_LIMIT)
      invalidate()
    }
  }
  const onUp = (e) => {
    pointers.delete(e.pointerId)
    pinch = null
  }
  const onWheel = (e) => {
    e.preventDefault()
    callbacks.onResize?.(Math.round((widthCm - e.deltaY * 0.01) * 10) / 10)
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  return {
    // Where the design sits, and what the camera should frame.
    setPlacement(placement, perimeterCm, view = 'design') {
      widthCm = placement.widthCm
      material.uniforms.uPlace.value.set(
        placement.arcCm, placement.centreCm, placement.widthCm, placement.heightCm)
      goal = { ...viewFrame(placement, view), yaw: designYaw(placement, perimeterCm) }
      invalidate()
    },
    // An ink canvas from loadDesign.
    setDesign(inkCanvas) {
      const next = new THREE.CanvasTexture(inkCanvas)
      next.colorSpace = THREE.SRGBColorSpace
      next.anisotropy = renderer.capabilities.getMaxAnisotropy()
      texture?.dispose()
      texture = next
      material.uniforms.uDesign.value = next
      invalidate()
    },
    setSpin(on) { spin = Boolean(on) },
    dispose() {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('wheel', onWheel)
      geometry?.dispose()
      texture?.dispose()
      blank.dispose()
      material.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}
