/**
 * The five severity tiers (spec 3.3d) and their shapes. A tier is always shown as shape + label, never
 * colour alone: T1 Critical diamond, T2 High triangle, T3 Medium disc, T4 Low square, T5 Info ring.
 * The labels (`T1 Critical`) live in `copy.services.review.demo.tiers`; the drawings are in `tier-shapes.ts`.
 * This file is only what the entry chunk needs (the tiers, counting, sorting), so it stays tiny.
 */

export type Tier = 1 | 2 | 3 | 4 | 5
export const TIERS: readonly Tier[] = [1, 2, 3, 4, 5]

/** Most severe first (T1 before T5), then by line. The order the findings are listed in. */
export function bySeverityThenLine<T extends { tier: Tier; line: number }>(a: T, b: T): number {
  return a.tier - b.tier || a.line - b.line
}

/** Reading order: by line, then most severe first. The order the galley shows them in. */
export function byLineThenSeverity<T extends { tier: Tier; line: number }>(a: T, b: T): number {
  return a.line - b.line || a.tier - b.tier
}

/** How many findings each tier has: `{ 1: 2, 2: 0, 3: 1, 4: 2, 5: 1 }`. */
export function tierCounts(findings: ReadonlyArray<{ tier: Tier }>): Record<Tier, number> {
  const counts: Record<Tier, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const finding of findings) counts[finding.tier] += 1
  return counts
}
