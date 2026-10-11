import { SHAPE_ART, TIER_SHAPE } from '../../../lib/review/tier-shapes.ts'
import type { Tier } from '../../../lib/review/tiers.ts'

/**
 * A tier's shape as a small inline SVG in the pen language: diamond, triangle, disc, square, ring. It takes
 * the colour of the text it sits in. Always paired with the tier's name, so meaning never rests on the
 * shape or on colour alone; the drawing itself is decorative (`aria-hidden`).
 */
export function TierShape({ tier, size = 14 }: { tier: Tier; size?: number }) {
  const art = SHAPE_ART[TIER_SHAPE[tier]]
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path d={art.d} fill={art.filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}
