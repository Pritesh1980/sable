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

  it('draws the silhouette cutout mask in tattoo mode with ink darkest and outside muted', () => {
    let drawn = null
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (image) => { drawn = image },
    })
    const values = new Float32Array(20 * 20).fill(1)
    for (let y = 8; y <= 11; y += 1) {
      for (let x = 8; x <= 11; x += 1) values[y * 20 + x] = 0
    }
    render(
      <ReliefMask
        heightmap={{ width: 20, height: 20, values }}
        settings={{ mode: 'tattoo', threshold: 0.55, invert: false, widthMm: 80, marginMm: 3, minStrokeMm: 0 }}
      />,
    )

    const canvas = screen.getByRole('img', { name: /cutout mask/i })
    expect(canvas.width).toBeGreaterThan(4)
    expect(canvas.height).toBeGreaterThan(4)
    let hasDarkInk = false
    let hasLightPlate = false
    for (let i = 0; i < drawn.data.length; i += 4) {
      if (drawn.data[i] === 24) hasDarkInk = true
      if (drawn.data[i] === 236) hasLightPlate = true
    }
    expect(hasDarkInk).toBe(true)
    expect(hasLightPlate).toBe(true)
  })
})
