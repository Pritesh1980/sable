import { normalizeBodyPlacement, PLACEMENTS } from '../data/artists'

function placementLabel(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export default function PlacementSelect({ value, onChange }) {
  const selected = typeof value === 'string' ? value : ''
  const normalized = normalizeBodyPlacement(selected)
  const hasStandardPlacement = PLACEMENTS.includes(normalized)
  const hasCustomPlacement = selected && !hasStandardPlacement

  return (
    <label className="block">
      <span className="mb-1.5 block font-v2-ui text-[0.68rem] tracking-[0.14em] uppercase text-v2-muted">
        Placement (optional)
      </span>
      <select
        value={hasStandardPlacement ? normalized : selected}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xs border border-v2-hairline bg-v2-ink px-3 py-2 font-v2-ui text-base text-v2-cream outline-hidden focus:border-v2-accent"
      >
        <option value="">No placement</option>
        {hasCustomPlacement && <option value={selected}>{placementLabel(selected)}</option>}
        {PLACEMENTS.map((placement) => (
          <option key={placement} value={placement}>{placementLabel(placement)}</option>
        ))}
      </select>
    </label>
  )
}
