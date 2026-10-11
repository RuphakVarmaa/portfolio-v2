import { fmt, wobblePoints, type Pt } from '../draw/wobble.ts'
import type { Tier } from './tiers.ts'

/**
 * The five tier shapes, drawn on a 16 x 16 grid with the site's pen wobble (seeded, so server and client
 * agree). A tier is always shape plus label, never colour alone: T1 diamond, T2 triangle, T3 disc,
 * T4 square, T5 ring.
 */

export type TierShape = 'diamond' | 'triangle' | 'disc' | 'square' | 'ring'

export const TIER_SHAPE: Readonly<Record<Tier, TierShape>> = { 1: 'diamond', 2: 'triangle', 3: 'disc', 4: 'square', 5: 'ring' }

export interface ShapeArt {
  /** An SVG path `d` on a 16 x 16 viewBox. */
  d: string
  /** Fill with the current colour (T1 to T4) or leave hollow (T5). */
  filled: boolean
}

function polygon(points: readonly Pt[], seed: string): string {
  return (
    wobblePoints(points, seed, 0.3)
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`)
      .join('') + 'Z'
  )
}

/** A circle as two arcs, centred in the 16 x 16 box, radius 5.5. */
const CIRCLE = 'M8 2.5a5.5 5.5 0 1 1 0 11a5.5 5.5 0 1 1 0-11Z'

export const SHAPE_ART: Readonly<Record<TierShape, ShapeArt>> = {
  diamond: { d: polygon([[8, 1.5], [14.5, 8], [8, 14.5], [1.5, 8]], 'tier:diamond'), filled: true },
  triangle: { d: polygon([[8, 2], [14.5, 13.5], [1.5, 13.5]], 'tier:triangle'), filled: true },
  disc: { d: CIRCLE, filled: true },
  square: { d: polygon([[2.5, 2.5], [13.5, 2.5], [13.5, 13.5], [2.5, 13.5]], 'tier:square'), filled: true },
  ring: { d: CIRCLE, filled: false },
}

