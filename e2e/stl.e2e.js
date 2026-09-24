import fs from 'node:fs'
import { test, expect, openDemo, openResult, DEMO_CONCEPT } from './fixtures'

// The 3D-print path end to end in a real browser: a committed demo SVG drawn
// to a real canvas, turned into a heightmap and mesh, and downloaded. Unit
// tests cover the maths with fake canvases; only this proves the file that
// lands in Downloads is a well-formed binary STL of the right size.

// Binary STL: 80-byte header, uint32 triangle count, then 50 bytes per
// triangle (normal + three vertices as float32, then a uint16).
function parseBinaryStl(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const header = buffer.subarray(0, 80).toString('latin1')
  const count = view.getUint32(80, true)
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  let finite = true
  for (let t = 0; t < count; t += 1) {
    const at = 84 + t * 50
    for (let v = 1; v <= 3; v += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = view.getFloat32(at + v * 12 + axis * 4, true)
        if (!Number.isFinite(value)) finite = false
        min[axis] = Math.min(min[axis], value)
        max[axis] = Math.max(max[axis], value)
      }
    }
  }
  return { header, count, byteLength: buffer.byteLength, min, max, finite }
}

async function download(page) {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download STL' }).tap(),
  ])
  expect(file.suggestedFilename()).toMatch(/\.stl$/)
  return parseBinaryStl(fs.readFileSync(await file.path()))
}

function expectPrintable(stl, { widthMm, topMm }) {
  expect(stl.header.startsWith('Sable relief')).toBe(true)
  expect(stl.byteLength).toBe(84 + stl.count * 50)
  expect(stl.count).toBeGreaterThan(1000)
  expect(stl.finite).toBe(true)
  // Sits flat on the bed at z = 0, and is as wide as asked.
  expect(stl.min[2]).toBeCloseTo(0, 3)
  expect(stl.max[0] - stl.min[0]).toBeCloseTo(widthMm, 0)
  // Tallest point is the base plus the full relief — never more.
  expect(stl.max[2]).toBeLessThanOrEqual(topMm + 0.01)
  expect(stl.max[2]).toBeGreaterThan(topMm * 0.5)
}

test.describe('relief STL export', () => {
  test.beforeEach(async ({ page }) => {
    await openDemo(page, '/concepts', { concepts: [DEMO_CONCEPT] })
    await openResult(page)
    await page.getByRole('button', { name: /^Make STL from/ }).tap()
    await expect(page.getByRole('dialog', { name: 'Make Relief STL' })).toBeVisible()
  })

  test('relief: downloads a valid binary STL at the chosen size', async ({ page }) => {
    const stl = await download(page)
    // Defaults: 80mm wide, 1.2mm base + 3mm relief.
    expectPrintable(stl, { widthMm: 80, topMm: 4.2 })
  })

  test('line art: shows the line mask and exports raised lines', async ({ page }) => {
    await page.getByRole('combobox', { name: 'Style' }).selectOption('lineart')
    await page.getByRole('button', { name: 'Line mask' }).tap()
    const mask = page.getByRole('img', { name: /^Line mask/ })
    await expect(mask).toBeVisible()
    // A real threshold of real pixels: some raised, some flat. A mask that is
    // all one colour means the image never reached the canvas.
    const tones = await mask.evaluate((canvas) => {
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
      let dark = 0
      let light = 0
      for (let i = 0; i < data.length; i += 4) (data[i] < 128 ? (dark += 1) : (light += 1))
      return { dark, light }
    })
    expect(tones.dark).toBeGreaterThan(0)
    expect(tones.light).toBeGreaterThan(0)

    const stl = await download(page)
    // Line-art defaults: 1.2mm base + 1.5mm lines.
    expectPrintable(stl, { widthMm: 80, topMm: 2.7 })
  })

  test('lithophane: exports the thin backlit plate', async ({ page }) => {
    await page.getByRole('combobox', { name: 'Style' }).selectOption('lithophane')
    const stl = await download(page)
    // Lithophane defaults: 0.8mm base + 2.2mm relief.
    expectPrintable(stl, { widthMm: 80, topMm: 3.0 })
  })

  test('3D preview renders a WebGL canvas', async ({ page }) => {
    await page.getByRole('button', { name: '3D preview' }).tap()
    const preview = page.getByRole('img', { name: '3D preview of the relief' })
    await expect(preview).toBeVisible()
    const canvas = preview.locator('canvas')
    await expect(canvas).toBeVisible()
    const box = await canvas.boundingBox()
    expect(box.width).toBeGreaterThan(100)
    expect(box.height).toBeGreaterThan(100)
  })
})
