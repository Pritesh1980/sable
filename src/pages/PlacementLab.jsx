import { useState } from 'react'
import { useSearchParams } from 'react-router'
import ArmPlacementPanel from '../components/ArmPlacementPanel'

// Lab page for the 3D placement view (#195): a demo design on a 3D upper arm
// at true size. Not linked from the nav. The view and its controls are
// ArmPlacementPanel, shared with the drawer a concept result opens; the 3D
// part is a second lazy chunk, so this page's shell paints before three.js
// arrives.
const base = import.meta.env?.BASE_URL || '/'

// Fictional demo designs only (light lines on near-black, like concept cards).
// Sable's own fictional demo tattoos, lifted off their photos as flat designs
// (scripts/blender/extract-design.py), then two of the simple line cards.
const DESIGNS = [
  { label: 'Ocean hourglass', src: 'models/designs/hourglass.webp' },
  { label: 'Tiger portrait', src: 'models/designs/tiger.webp' },
  { label: 'Koi and waves', src: 'models/designs/koi.webp' },
  { label: 'Serpent (blackwork card)', src: 'images/demo/ferrum_line/3.svg' },
  { label: 'Fern (fine-line card)', src: 'images/demo/mora.blackfern/2.svg' },
]

// The first design's shape (height / width), so the readout doesn't jump when
// its image arrives.
const HOURGLASS_ASPECT = 1010 / 450

export default function PlacementLab() {
  const [params] = useSearchParams()
  const spin = params.get('spin') === '1'
  const [design, setDesign] = useState(DESIGNS[0].src)

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col bg-v2-ink px-4 pb-24 pt-6 text-v2-cream">
      <p className="font-v2-ui text-xs uppercase tracking-[0.2em] text-v2-accent">Lab</p>
      <h1 className="font-v2-display text-3xl">On the arm, in 3D</h1>
      <p className="mt-1 font-v2-ui text-sm text-v2-muted">
        Drag to turn the arm. Pinch to resize the design.
      </p>

      <ArmPlacementPanel
        className="mt-4" stageClassName="h-[56vh] min-h-[320px]"
        imageSrc={`${base}${design}`} initialAspect={HOURGLASS_ASPECT} spin={spin}
      >
        <label className="mt-3 block font-v2-ui text-sm text-v2-muted">
          Design
          <select
            value={design} onChange={(e) => setDesign(e.target.value)}
            className="mt-1 block h-11 w-full rounded-xs border border-v2-hairline bg-v2-surface px-3 text-v2-cream"
          >
            {DESIGNS.map((d) => <option key={d.src} value={d.src}>{d.label}</option>)}
          </select>
        </label>
      </ArmPlacementPanel>
    </main>
  )
}
