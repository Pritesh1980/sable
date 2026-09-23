import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReliefMask from '../components/ReliefMask'

afterEach(() => vi.restoreAllMocks())

describe('ReliefMask', () => {
  it('draws raised areas dark and the plate light, one pixel per sample', () => {
    let drawn = null
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (image) => { drawn = image },
    })
    const heightmap = { width: 2, height: 2, values: [0.9, 0.1, 0.1, 0.9] }
    render(<ReliefMask heightmap={heightmap} settings={{ mode: 'lineart', threshold: 0.5, invert: true, smoothing: 'off' }} />)

    const canvas = screen.getByRole('img', { name: /line mask/i })
    expect(canvas.width).toBe(2)
    expect(canvas.height).toBe(2)
    // invert: dark source pixels (0.1) are the raised lines → drawn dark.
    const luminance = (i) => drawn.data[i * 4]
    expect(luminance(1)).toBeLessThan(80)
    expect(luminance(2)).toBeLessThan(80)
    expect(luminance(0)).toBeGreaterThan(180)
    expect(drawn.data[3]).toBe(255)
  })
})
