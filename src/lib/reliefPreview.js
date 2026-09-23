const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

// Relief mesh → three.js buffers, centred in x/y so the plate orbits about
// its middle. Indexed (shared vertices) so computeVertexNormals smooth-shades.
export function meshToGeometryArrays(mesh) {
  const cx = mesh.size.widthMm / 2
  const cy = mesh.size.depthMm / 2
  const positions = new Float32Array(mesh.vertices.length * 3)
  mesh.vertices.forEach(([x, y, z], i) => {
    positions[i * 3] = x - cx
    positions[i * 3 + 1] = y - cy
    positions[i * 3 + 2] = z
  })
  return { positions, indices: Uint32Array.from(mesh.faces.flat()) }
}

// A small on-demand WebGL stage for the relief: one mesh, a raking light to
// show the depth, drag to orbit. Renders only when something changes (no
// animation loop). Returns null if WebGL is unavailable, so callers fall back.
export function createReliefPreview(THREE, mount) {
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  } catch {
    return null
  }

  let width = mount.clientWidth || 1
  let height = mount.clientHeight || 1
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
  renderer.setPixelRatio(Math.min(dpr, 2))
  // updateStyle=false: the canvas CSS stays 100% and follows its container.
  renderer.setSize(width, height, false)
  const canvas = renderer.domElement
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.display = 'block'
  // Vertical swipes still scroll the drawer on a phone; horizontal drags (and
  // any mouse drag) orbit the model.
  canvas.style.touchAction = 'pan-y'
  mount.appendChild(canvas)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(35, width / height, 1, 5000)
  camera.up.set(0, 0, 1)
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x1a1512, 0.9))
  const key = new THREE.DirectionalLight(0xffffff, 1.8)
  key.position.set(-1, 1.2, 0.8)
  scene.add(key)

  const material = new THREE.MeshStandardMaterial({ color: 0xd9d2c5, roughness: 0.85, metalness: 0 })
  let geometry = null
  let object = null
  let radius = 50
  let centreZ = 0
  let yaw = -0.6
  let pitch = 0.95

  function render() {
    const distance = radius * 2.8
    camera.position.set(
      distance * Math.sin(pitch) * Math.cos(yaw),
      distance * Math.sin(pitch) * Math.sin(yaw),
      centreZ + distance * Math.cos(pitch),
    )
    camera.lookAt(0, 0, centreZ)
    renderer.render(scene, camera)
  }

  function setMesh(mesh) {
    const { positions, indices } = meshToGeometryArrays(mesh)
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    next.setIndex(new THREE.BufferAttribute(indices, 1))
    next.computeVertexNormals()
    if (object) scene.remove(object)
    geometry?.dispose()
    geometry = next
    object = new THREE.Mesh(geometry, material)
    scene.add(object)
    radius = Math.max(mesh.size.widthMm, mesh.size.depthMm) / 2
    centreZ = mesh.size.heightMm / 2
    render()
  }

  let drag = null
  function onPointerDown(e) {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
    canvas.setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e) {
    if (!drag || drag.id !== e.pointerId) return
    yaw -= (e.clientX - drag.x) * 0.01
    pitch = clamp(pitch - (e.clientY - drag.y) * 0.01, 0.05, 1.5)
    drag.x = e.clientX
    drag.y = e.clientY
    render()
  }
  function onPointerUp(e) {
    if (drag?.id === e.pointerId) drag = null
  }
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)

  let ro = null
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      width = mount.clientWidth || width
      height = mount.clientHeight || height
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      render()
    })
    ro.observe(mount)
  }

  function dispose() {
    ro?.disconnect()
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointercancel', onPointerUp)
    geometry?.dispose()
    material.dispose()
    renderer.dispose()
    renderer.forceContextLoss?.()
    canvas.parentNode?.removeChild(canvas)
  }

  return { setMesh, dispose }
}
