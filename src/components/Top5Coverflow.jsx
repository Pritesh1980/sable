import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { coverflowLayout } from '../data/coverflowLayout'

// WebGL coverflow of the top-5 artist images. Lazy-loaded (see Top5Hero) so
// three.js stays out of the initial bundle. Pure geometry comes from
// coverflowLayout; this file only turns those transforms into animated meshes.

const CARD_W = 1.7
const CARD_H = 2.3
const SPREAD = 2.9 // world units per layout x-unit — neighbours pushed to the edges
const DEPTH = 1.5 // world units per layout z-unit
const LERP = 0.16 // easing toward target each frame
const ACCENT = 0x8b1a1a // deep red backing glow on the focused card

export default function Top5Coverflow({ items, activeIndex, onSelect }) {
  const mountRef = useRef(null)
  const activeRef = useRef(activeIndex)
  const selectRef = useRef(onSelect)

  useEffect(() => { activeRef.current = activeIndex }, [activeIndex])
  useEffect(() => { selectRef.current = onSelect }, [onSelect])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || items.length === 0) return

    const width = mount.clientWidth || 640
    const height = mount.clientHeight || 280

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100)
    camera.position.set(0, 0, 3.25)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.touchAction = 'pan-y'
    renderer.domElement.style.cursor = 'grab'

    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    const geometry = new THREE.PlaneGeometry(CARD_W, CARD_H)
    const disposables = [geometry]

    // One mesh per artist; a dim placeholder material until the texture loads.
    const cards = items.map((item) => {
      const material = new THREE.MeshBasicMaterial({
        color: 0x222020,
        transparent: true,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(geometry, material)
      scene.add(mesh)
      disposables.push(material)
      if (item.image) {
        loader.load(
          item.image,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace
            material.map = tex
            material.color.set(0xffffff)
            material.needsUpdate = true
            disposables.push(tex)
          },
          undefined,
          () => {}, // keep the placeholder on load failure
        )
      }
      return mesh
    })

    // Soft accent glow behind whichever card is focused.
    const glowMat = new THREE.MeshBasicMaterial({
      color: ACCENT,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
    })
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W * 1.25, CARD_H * 1.2), glowMat)
    scene.add(glow)
    disposables.push(glowMat, glow.geometry)

    // --- interaction: drag to spin, tap to focus -------------------------
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let downX = 0
    let dragging = false

    const localX = (clientX) => {
      const rect = renderer.domElement.getBoundingClientRect()
      return clientX - rect.left
    }
    const onPointerDown = (e) => {
      dragging = true
      downX = localX(e.clientX)
      renderer.domElement.style.cursor = 'grabbing'
    }
    const onPointerUp = (e) => {
      if (!dragging) return
      dragging = false
      renderer.domElement.style.cursor = 'grab'
      const dx = localX(e.clientX) - downX
      if (Math.abs(dx) < 6) {
        // tap → focus the card under the pointer
        const rect = renderer.domElement.getBoundingClientRect()
        pointer.x = ((localX(e.clientX)) / rect.width) * 2 - 1
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(pointer, camera)
        const hit = raycaster.intersectObjects(cards)[0]
        if (hit) {
          const idx = cards.indexOf(hit.object)
          if (idx >= 0) selectRef.current?.(idx)
        }
      } else {
        // drag → step focus by how far they pulled
        const step = Math.round(-dx / 90)
        const next = Math.max(0, Math.min(items.length - 1, activeRef.current + step))
        if (next !== activeRef.current) selectRef.current?.(next)
      }
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)

    // --- animation loop --------------------------------------------------
    let raf = 0
    const animate = () => {
      const layout = coverflowLayout(items.length, activeRef.current)
      cards.forEach((mesh, i) => {
        const t = layout[i]
        mesh.position.x += (t.x * SPREAD - mesh.position.x) * LERP
        mesh.position.z += (t.z * DEPTH - mesh.position.z) * LERP
        const targetRot = THREE.MathUtils.degToRad(t.rotationY)
        mesh.rotation.y += (targetRot - mesh.rotation.y) * LERP
        const s = t.scale
        mesh.scale.x += (s - mesh.scale.x) * LERP
        mesh.scale.y += (s - mesh.scale.y) * LERP
        mesh.material.opacity += (t.opacity - mesh.material.opacity) * LERP
        mesh.renderOrder = Math.round(t.z * 100)
      })
      const focused = cards[Math.max(0, Math.min(cards.length - 1, activeRef.current))]
      if (focused) {
        glow.position.set(focused.position.x, focused.position.y, focused.position.z - 0.05)
        glowMat.opacity += (0.32 - glowMat.opacity) * LERP
      }
      renderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    animate()

    // --- resize ----------------------------------------------------------
    const onResize = () => {
      const w = mount.clientWidth || width
      const h = mount.clientHeight || height
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(mount)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      disposables.forEach((d) => d.dispose?.())
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
    // items identity drives a full rebuild; activeIndex is read via ref.
  }, [items])

  return <div ref={mountRef} className="w-full h-[62vh] min-h-[440px] select-none" aria-hidden="true" />
}
