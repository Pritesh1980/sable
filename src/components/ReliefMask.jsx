import { useEffect, useMemo, useRef } from 'react'
import { buildReliefHeightField } from '../data/reliefStl'

const INK = 24
const PLATE = 236

// Flat view of exactly what line art will raise: dark = raised, light =
// plate, one pixel per sample (scaled up crisp), so broken or vanishing lines
// show up while the threshold is being tuned.
export default function ReliefMask({ heightmap, settings }) {
  const canvasRef = useRef(null)
  const field = useMemo(
    () => (heightmap && settings ? buildReliefHeightField(heightmap, settings) : null),
    [heightmap, settings],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !field) return
    canvas.width = field.width
    canvas.height = field.height
    const context = canvas.getContext('2d')
    if (!context) return
    const image = context.createImageData(field.width, field.height)
    for (let i = 0; i < field.values.length; i += 1) {
      const shade = Math.round(PLATE - field.values[i] * (PLATE - INK))
      image.data[i * 4] = shade
      image.data[i * 4 + 1] = shade
      image.data[i * 4 + 2] = shade
      image.data[i * 4 + 3] = 255
    }
    context.putImageData(image, 0, 0)
  }, [field])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Line mask: dark areas will be raised"
      width={field?.width || 1}
      height={field?.height || 1}
      className="aspect-[4/3] w-full rounded-xs border border-ink-border bg-ink-muted object-contain [image-rendering:pixelated]"
    />
  )
}
