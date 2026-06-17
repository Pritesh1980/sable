import { describe, it, expect } from 'vitest'
import {
  selectRenderMode,
  detectWebGL,
  prefersReducedMotion,
} from '../data/renderMode'

describe('selectRenderMode', () => {
  it('uses webgl only when supported and motion is allowed', () => {
    expect(selectRenderMode({ webglSupported: true, reducedMotion: false })).toBe('webgl')
  })

  it('falls back to static when webgl is unavailable', () => {
    expect(selectRenderMode({ webglSupported: false, reducedMotion: false })).toBe('static')
  })

  it('falls back to static when the user prefers reduced motion', () => {
    expect(selectRenderMode({ webglSupported: true, reducedMotion: true })).toBe('static')
  })
})

describe('detectWebGL', () => {
  const canvasReturning = (ctx) => () => ({ getContext: () => ctx })

  it('is true when a webgl context is available', () => {
    expect(detectWebGL(canvasReturning({}))).toBe(true)
  })

  it('is false when no context is returned', () => {
    expect(detectWebGL(canvasReturning(null))).toBe(false)
  })

  it('is false when context creation throws', () => {
    expect(detectWebGL(() => ({ getContext: () => { throw new Error('no gl') } }))).toBe(false)
  })
})

describe('prefersReducedMotion', () => {
  it('reflects the media query result', () => {
    expect(prefersReducedMotion(() => ({ matches: true }))).toBe(true)
    expect(prefersReducedMotion(() => ({ matches: false }))).toBe(false)
  })

  it('is false when matchMedia is unavailable', () => {
    expect(prefersReducedMotion(undefined)).toBe(false)
  })
})
