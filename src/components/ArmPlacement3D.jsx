import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createArmEngine, loadDesign } from '../lib/armPlacement'

// A design on a 3D upper arm at true size (#195 spike). This file is the lazy
// chunk that brings in three.js and the glTF loader, so neither enters the
// main bundle; the scene itself is src/lib/armPlacement.js.
export default function ArmPlacement3D({
  modelUrl, imageSrc, placement, perimeterCm, view = 'design',
  onResize, onDesignSize, onReady, onError, spin = false,
}) {
  const mountRef = useRef(null)
  const engineRef = useRef(null)
  // One object the engine reads at call time, kept current without rebuilding
  // the scene when a handler's identity changes.
  const callbacks = useRef({})

  useEffect(() => {
    Object.assign(callbacks.current, { onResize, onDesignSize, onReady, onError })
  }, [onResize, onDesignSize, onReady, onError])

  useEffect(() => {
    const engine = createArmEngine(THREE, GLTFLoader, mountRef.current, {
      modelUrl, callbacks: callbacks.current,
    })
    engineRef.current = engine
    return () => {
      engineRef.current = null
      engine.dispose()
    }
  }, [modelUrl])

  useEffect(() => {
    let cancelled = false
    if (!imageSrc) return undefined
    loadDesign(imageSrc).then((canvas) => {
      if (cancelled || !engineRef.current) return
      engineRef.current.setDesign(canvas)
      callbacks.current.onDesignSize?.({ width: canvas.width, height: canvas.height })
    }).catch((error) => { if (!cancelled) callbacks.current.onError?.(error) })
    return () => { cancelled = true }
  }, [imageSrc, modelUrl])

  useEffect(() => {
    engineRef.current?.setPlacement(placement, perimeterCm, view)
  }, [placement, perimeterCm, view, modelUrl])

  useEffect(() => {
    engineRef.current?.setSpin(spin)
  }, [spin, modelUrl])

  return <div ref={mountRef} className="h-full w-full" data-testid="arm-placement-3d" />
}
