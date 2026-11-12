import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { clampPlacement, LIMBS } from '../data/placement3d'

// Contract between scripts/blender/export-arm-gltf.py and the 3D placement
// view: the shipped model must carry the skin coordinates the shader reads,
// and its sidecar the table the size readout is clamped by.
// Every limb in LIMBS (#206) must ship its model.
describe.each(Object.values(LIMBS))('public/models/$file', ({ id, file, placement }) => {
  const meta = JSON.parse(readFileSync(`public/models/${file}.json`, 'utf8'))
  const glb = readFileSync(`public/models/${file}.glb`)

  it('is the limb it is filed under, with the extent its whole view frames', () => {
    expect(meta.limb).toBe(id)
    const [lo, hi] = meta.extent_cm
    expect(lo).toBeLessThan(meta.skin_cm[0])
    expect(hi).toBeGreaterThan(meta.skin_cm[1])
  })

  it('is an uncompressed binary glTF with the skin attributes', () => {
    expect(glb.subarray(0, 4).toString('latin1')).toBe('glTF')
    const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'))
    const { attributes } = json.meshes[0].primitives[0]
    expect(Object.keys(attributes).sort()).toEqual(['NORMAL', 'POSITION', 'TEXCOORD_0', 'TEXCOORD_1'])
    // Draco would need a ~250 kB decoder to save ~100 kB: see docs/BLENDER.md.
    expect(json.extensionsRequired ?? []).toEqual([])
  })

  it('stays phone-sized', () => {
    expect(glb.length).toBeLessThan(200_000)
    expect(meta.bytes).toBe(glb.length)
  })

  it('comes from MakeHuman CC0 data, which may be redistributed', () => {
    expect(meta.source).toMatch(/CC0/)
  })

  it('has a circumference for every centimetre of skin', () => {
    const [lo, hi] = meta.skin_cm
    expect(meta.perimeter_cm[0][0]).toBeCloseTo(lo)
    expect(meta.perimeter_cm.at(-1)[0]).toBe(hi)
    for (const [, c] of meta.perimeter_cm) expect(c).toBeGreaterThan(15)
  })

  it('fits the default placement without clamping it', () => {
    const arm = { skinCm: meta.skin_cm, perimeterCm: meta.perimeter_cm, aspect: 760 / 600 }
    expect(clampPlacement(placement, arm)).toMatchObject(placement)
  })
})
