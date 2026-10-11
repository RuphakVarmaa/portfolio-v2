/**
 * Deterministic "pen wobble" for the hand-drawn SVG language (spec 2.5).
 *
 * Everything here is a pure function of its inputs: a seeded PRNG built from integer arithmetic, plus
 * +, -, *, / and sqrt (all exactly specified by IEEE 754), and no Math.random / Date / sin / cos. The
 * server renders the same path strings the client does, so hydration never sees a mismatch.
 */

export type Pt = readonly [number, number]

/** Spec upper bound: a wobbled point never moves more than this many px from where it was drawn. */
export const WOBBLE_MAX = 1.2

/** FNV-1a, 32 bit. */
export function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: a tiny seeded PRNG returning floats in [0, 1). Same seed, same sequence, in any engine. */
export function createRng(seed: number | string): () => number {
  let a = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Number to SVG text: two decimals, no "-0", no trailing zeros. */
export function fmt(n: number): string {
  const rounded = Math.round(n * 100) / 100
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

const clampAmp = (amp: number) => Math.max(0, Math.min(WOBBLE_MAX, amp))

/**
 * Displace every point by a random vector of length <= `amp` (clamped to WOBBLE_MAX). Uses a square
 * jitter scaled by 1/sqrt(2), so the worst case is exactly `amp` without any trigonometry.
 */
export function wobblePoints(points: readonly Pt[], seed: number | string, amp = 0.9): Pt[] {
  const rng = createRng(seed)
  const k = clampAmp(amp) * 0.7071067811865476
  return points.map(([x, y]) => [x + (rng() * 2 - 1) * k, y + (rng() * 2 - 1) * k] as const)
}

/** Insert points so no segment is longer than `step`. Keeps the original points. */
export function subdivide(points: readonly Pt[], step = 22, closed = false): Pt[] {
  if (points.length < 2) return points.slice()
  const out: Pt[] = []
  const count = closed ? points.length : points.length - 1
  for (let i = 0; i < count; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    const length = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1))
    const pieces = Math.max(1, Math.ceil(length / step))
    for (let j = 0; j < pieces; j++) {
      const t = j / pieces
      out.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t])
    }
  }
  if (!closed) out.push(points[points.length - 1])
  return out
}

/**
 * Smooth path through the points (Catmull-Rom converted to cubic Beziers). `closed` joins the last
 * point back to the first. Returns an SVG `d` string.
 */
export function smoothPath(points: readonly Pt[], closed = false): string {
  const n = points.length
  if (n === 0) return ''
  if (n === 1) return `M${fmt(points[0][0])} ${fmt(points[0][1])}`
  if (n === 2 && !closed) return `M${fmt(points[0][0])} ${fmt(points[0][1])}L${fmt(points[1][0])} ${fmt(points[1][1])}`
  const at = (i: number): Pt => (closed ? points[((i % n) + n) % n] : points[Math.max(0, Math.min(n - 1, i))])
  let d = `M${fmt(points[0][0])} ${fmt(points[0][1])}`
  const segments = closed ? n : n - 1
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += `C${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2[0])} ${fmt(p2[1])}`
  }
  return closed ? `${d}Z` : d
}

export interface PenOptions {
  /** Wobble amplitude in px, clamped to WOBBLE_MAX (1.2). Default 0.9. */
  amp?: number
  /** Longest straight piece before a new wobble point is inserted. Default 22. */
  step?: number
  closed?: boolean
}

/** A polyline drawn "by hand": subdivided, jittered with the seeded PRNG, smoothed. Returns a `d` string. */
export function penLine(points: readonly Pt[], seed: number | string, options: PenOptions = {}): string {
  const { amp = 0.9, step = 22, closed = false } = options
  const dense = subdivide(points, step, closed)
  return smoothPath(wobblePoints(dense, seed, amp), closed)
}
