import { describe, expect, it, vi, afterEach } from 'vitest'
import { imageToHeightmap } from '../data/reliefImage'

afterEach(() => vi.restoreAllMocks())

// Transparent PNG line art: transparent pixels read as black (0,0,0,0), so in
// line-art mode the whole plate rose. Painting onto white first fixes it.
describe('imageToHeightmap', () => {
  it('paints the image onto white before sampling, so transparency reads as background', () => {
    const calls = []
    const context = {
      set fillStyle(v) { calls.push(['fillStyle', v]) },
      fillRect: (...a) => calls.push(['fillRect', ...a]),
      drawImage: () => calls.push(['drawImage']),
      getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]) }),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)

    const heightmap = imageToHeightmap({ naturalWidth: 2, naturalHeight: 2 }, 'medium')

    const draw = calls.findIndex((c) => c[0] === 'drawImage')
    const fill = calls.findIndex((c) => c[0] === 'fillRect')
    expect(calls.find((c) => c[0] === 'fillStyle')[1]).toBe('#ffffff')
    expect(fill).toBeGreaterThanOrEqual(0)
    expect(fill).toBeLessThan(draw)
    expect(heightmap.values).toEqual([1, 0, 1, 0])
  })
})
