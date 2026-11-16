import { useEffect, useMemo, useRef } from 'react'
import { buildReliefHeightField } from '../data/reliefStl'
import { prepareTattooPrintMask } from '../data/tattooPrint'

const INK = 24
const PLATE = 236
const OUTSIDE = [42, 38, 35]

// Flat view of exactly what will print: in line-art mode dark = raised and
// light = plate; in two-colour tattoo mode it shows the silhouette-cut plate
// (light) against the outside cutout (dark warm grey) and the ink (black).
export default function ReliefMask({ heightmap, settings }) {
  const canvasRef = useRef(null)
  const isTattoo = settings?.mode === 'tattoo'

  const field = useMemo(() => {
    if (!heightmap || !settings) return null
    return isTattoo ? prepareTattooPrintMask(heightmap, settings) : buildReliefHeightField(heightmap, settings)
  }, [heightmap, settings, isTattoo])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !field) return
    canvas.width = field.width
    canvas.height = field.height
    const context = canvas.getContext('2d')
    if (!context) return
    const image = context.createImageData(field.width, field.height)
    if (isTattoo) {
      for (let i = 0; i < field.baseMask.length; i += 1) {
        if (field.baseMask[i] === 0) {
          image.data[i * 4] = OUTSIDE[0]
          image.data[i * 4 + 1] = OUTSIDE[1]
          image.data[i * 4 + 2] = OUTSIDE[2]
        } else if (field.inkMask[i] === 1) {
          image.data[i * 4] = INK
          image.data[i * 4 + 1] = INK
          image.data[i * 4 + 2] = INK
        } else {
          image.data[i * 4] = PLATE
          image.data[i * 4 + 1] = PLATE - 4
          image.data[i * 4 + 2] = PLATE - 10
        }
        image.data[i * 4 + 3] = 255
      }
    } else {
      for (let i = 0; i < field.values.length; i += 1) {
        const shade = Math.round(PLATE - field.values[i] * (PLATE - INK))
        image.data[i * 4] = shade
        image.data[i * 4 + 1] = shade
        image.data[i * 4 + 2] = shade
        image.data[i * 4 + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)
  }, [field, isTattoo])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={isTattoo ? 'Cutout mask: ink in silhouette plate' : 'Line mask: dark areas will be raised'}
      width={field?.width || 1}
      height={field?.height || 1}
      className="aspect-[4/3] w-full rounded-xs border border-ink-border bg-ink-muted object-contain [image-rendering:pixelated]"
    />
  )
}
