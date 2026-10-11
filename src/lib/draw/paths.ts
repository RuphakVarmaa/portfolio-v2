import { createRng, fmt, penLine, smoothPath, subdivide, wobblePoints, type Pt } from './wobble.ts'

/**
 * Geometry helpers for the hand-drawn SVG language. Every function returns plain `d` strings (and a few
 * coordinates) and is a pure function of its arguments, so server and client agree exactly.
 *
 * Pass a `seed` (any string, e.g. `'board:lamp:retrieval'`) to get the pen wobble; omit it for crisp
 * geometry (hit areas, clip paths). Give every drawn object its own seed so no two strokes wobble alike.
 *
 * Style reminder: stroke var(--ink), width var(--stroke-draw), round caps and joins, fill none.
 */

export type { Pt } from './wobble.ts'

/** cos/sin(60 degrees) and friends, as constants: no trigonometry at runtime (see wobble.ts). */
const H = 0.8660254037844386

const d2 = (a: Pt, b: Pt) => Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]))

function unit(from: Pt, to: Pt): Pt {
  const length = d2(from, to) || 1
  return [(to[0] - from[0]) / length, (to[1] - from[1]) / length]
}

/** Straight segments through the points with the pen jitter but no smoothing (keeps corners crisp). */
function crispLine(points: readonly Pt[], seed: number | string, amp: number): string {
  const jittered = wobblePoints(points, seed, amp)
  return jittered.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`).join('')
}

// ---- rounded rectangle ---------------------------------------------------------------------------

/** Quarter-circle offsets (unit radius) in 30 degree steps, for each corner, clockwise from the top-left. */
const CORNER_ARCS: readonly (readonly Pt[])[] = [
  [[-1, 0], [-H, -0.5], [-0.5, -H], [0, -1]], // top-left
  [[0, -1], [0.5, -H], [H, -0.5], [1, 0]], // top-right
  [[1, 0], [H, 0.5], [0.5, H], [0, 1]], // bottom-right
  [[0, 1], [-0.5, H], [-H, 0.5], [-1, 0]], // bottom-left
]

function roundedRectOutline(x: number, y: number, w: number, h: number, r: number, step: number): Pt[] {
  const centers: Pt[] = [
    [x + r, y + r],
    [x + w - r, y + r],
    [x + w - r, y + h - r],
    [x + r, y + h - r],
  ]
  const points: Pt[] = []
  for (let corner = 0; corner < 4; corner++) {
    const [cx, cy] = centers[corner]
    const arc = CORNER_ARCS[corner].map(([ox, oy]): Pt => [cx + ox * r, cy + oy * r])
    const previous = points.length > 0 ? points[points.length - 1] : null
    // Interior points of the straight edge leading into this corner (the edge starts at the previous arc's end).
    if (previous) {
      const edge = subdivide([previous, arc[0]], step)
      points.push(...edge.slice(1, -1))
    }
    points.push(...arc)
  }
  // Closing edge from the last arc back to the first.
  const closing = subdivide([points[points.length - 1], points[0]], step)
  points.push(...closing.slice(1, -1))
  return points
}

/**
 * Rounded rectangle. Without `seed`: an exact path made of arcs. With `seed`: the same outline drawn by
 * hand (corner arcs and edges jittered by `amp`, then smoothed). `r` is clamped to half the shorter side.
 */
export function roundedRect(x: number, y: number, w: number, h: number, r: number, seed?: number | string, amp = 0.8): string {
  const radius = Math.max(1, Math.min(r, w / 2, h / 2))
  if (seed === undefined) {
    return (
      `M${fmt(x + radius)} ${fmt(y)}H${fmt(x + w - radius)}A${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(x + w)} ${fmt(y + radius)}` +
      `V${fmt(y + h - radius)}A${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(x + w - radius)} ${fmt(y + h)}` +
      `H${fmt(x + radius)}A${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(x)} ${fmt(y + h - radius)}` +
      `V${fmt(y + radius)}A${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(x + radius)} ${fmt(y)}Z`
    )
  }
  return smoothPath(wobblePoints(roundedRectOutline(x, y, w, h, radius, 26), seed, amp), true)
}

// ---- brackets ------------------------------------------------------------------------------------

/**
 * Four corner brackets (not a full rectangle) around the box `x, y, w, h`; each arm is `len` long.
 * One `d` string with four sub-paths. Used for detection boxes and the retrieval window markers.
 */
export function bracket(x: number, y: number, w: number, h: number, len: number, seed?: number | string, amp = 0.5): string {
  const l = Math.min(len, w / 2, h / 2)
  const corners: Pt[][] = [
    [[x, y + l], [x, y], [x + l, y]],
    [[x + w - l, y], [x + w, y], [x + w, y + l]],
    [[x + w, y + h - l], [x + w, y + h], [x + w - l, y + h]],
    [[x + l, y + h], [x, y + h], [x, y + h - l]],
  ]
  return corners
    .map((points, i) =>
      seed === undefined
        ? points.map(([px, py], j) => `${j === 0 ? 'M' : 'L'}${fmt(px)} ${fmt(py)}`).join('')
        : crispLine(points, `${seed}:${i}`, amp),
    )
    .join('')
}

// ---- hexagon + lamp ------------------------------------------------------------------------------

/** Flat-sided hexagon with circumradius `R`, centred on `cx, cy`. Crisp corners; jittered when seeded. */
export function hexagon(cx: number, cy: number, R: number, seed?: number | string, amp = 0.6): string {
  const points: Pt[] = [
    [cx + R, cy],
    [cx + R / 2, cy + H * R],
    [cx - R / 2, cy + H * R],
    [cx - R, cy],
    [cx - R / 2, cy - H * R],
    [cx + R / 2, cy - H * R],
  ]
  const drawn = seed === undefined ? points : wobblePoints(points, seed, amp)
  return drawn.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${fmt(px)} ${fmt(py)}`).join('') + 'Z'
}

/** A perfect circle as two arcs. */
export function circle(cx: number, cy: number, r: number): string {
  return `M${fmt(cx - r)} ${fmt(cy)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0Z`
}

/**
 * The quantized lamp glow (spec 2.5): four concentric rings, hard stops, never a smooth gradient.
 * `k` multiplies the lens radius; `opacity` multiplies `--live`. Draw largest first, lens last.
 */
export const LAMP_GLOW_RINGS: readonly { k: number; opacity: number }[] = [
  { k: 2.7, opacity: 0.12 },
  { k: 2.1, opacity: 0.3 },
  { k: 1.55, opacity: 0.6 },
  { k: 1, opacity: 1 },
]

export interface LampParts {
  /** Hexagonal bezel around the lens (stroke it with ink, fill it with the paper tone). */
  bezel: string
  /** The round lens (fill with --lamp-off, or --live when lit). */
  lens: string
  /** A short arc of glare on the lens. */
  glare: string
  /** Outer radius of the bezel, for layout and hit areas. */
  bezelRadius: number
}

/** A jewel lamp: hex bezel, round lens, glare. `r` is the lens radius; the bezel circumradius is 1.34 r. */
export function lamp(cx: number, cy: number, r: number, seed?: number | string): LampParts {
  const bezelRadius = r * 1.34
  return {
    bezel: hexagon(cx, cy, bezelRadius, seed === undefined ? undefined : `${seed}:bezel`, 0.6),
    lens: circle(cx, cy, r),
    glare: `M${fmt(cx - r * 0.55)} ${fmt(cy - r * 0.2)}Q${fmt(cx - r * 0.45)} ${fmt(cy - r * 0.62)} ${fmt(cx - r * 0.05)} ${fmt(cy - r * 0.68)}`,
    bezelRadius,
  }
}

// ---- patch cable ---------------------------------------------------------------------------------

export interface CableOptions {
  /** How far the cable droops below the straight line (px). Negative arches it. Default 36. */
  sag?: number
  /** Length of each plug body along the cable (px). Default 14. */
  plug?: number
  seed?: number | string
}

export interface CableParts {
  /** The cable itself, from `from` to `to`. Set `pathLength="1"` on the element to animate stroke-dashoffset 1 -> 0. */
  d: string
  /** Plug body + metal tip at `from` (draw over the cable, fill the paper tone). */
  plugA: string
  /** Plug body + metal tip at `to`. */
  plugB: string
  /** The midpoint of the cable (where a pulse dot or a tag can sit). */
  mid: Pt
}

function plugPath(at: Pt, direction: Pt, length: number, halfWidth: number): string {
  const [dx, dy] = direction
  const nx = -dy
  const ny = dx
  const tip = 3
  const a: Pt = [at[0] + nx * halfWidth, at[1] + ny * halfWidth]
  const b: Pt = [at[0] + dx * length + nx * halfWidth, at[1] + dy * length + ny * halfWidth]
  const c: Pt = [at[0] + dx * length - nx * halfWidth, at[1] + dy * length - ny * halfWidth]
  const e: Pt = [at[0] - nx * halfWidth, at[1] - ny * halfWidth]
  const metalA: Pt = [at[0] - dx * tip + nx * halfWidth * 0.45, at[1] - dy * tip + ny * halfWidth * 0.45]
  const metalB: Pt = [at[0] - dx * tip - nx * halfWidth * 0.45, at[1] - dy * tip - ny * halfWidth * 0.45]
  const body = [a, b, c, e].map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${fmt(px)} ${fmt(py)}`).join('') + 'Z'
  const metal = `M${fmt(a[0] - nx * halfWidth * 0.55)} ${fmt(a[1] - ny * halfWidth * 0.55)}L${fmt(metalA[0])} ${fmt(metalA[1])}L${fmt(metalB[0])} ${fmt(metalB[1])}L${fmt(e[0] + nx * halfWidth * 0.55)} ${fmt(e[1] + ny * halfWidth * 0.55)}`
  return body + metal
}

/** A patch cable between two sockets, drooping under its own weight, with a plug at each end. */
export function cable(from: Pt, to: Pt, options: CableOptions = {}): CableParts {
  const { sag = 36, plug = 14, seed } = options
  const rng = seed === undefined ? () => 0.5 : createRng(`${seed}:cable`)
  const jitter = () => (rng() - 0.5) * 1.2
  const dx = to[0] - from[0]
  const c1: Pt = [from[0] + dx * 0.3 + jitter(), from[1] + sag + jitter()]
  const c2: Pt = [from[0] + dx * 0.7 + jitter(), to[1] + sag + jitter()]
  const d = `M${fmt(from[0])} ${fmt(from[1])}C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(to[0])} ${fmt(to[1])}`
  // Cubic midpoint (t = 0.5): (p0 + 3 c1 + 3 c2 + p3) / 8.
  const mid: Pt = [(from[0] + 3 * c1[0] + 3 * c2[0] + to[0]) / 8, (from[1] + 3 * c1[1] + 3 * c2[1] + to[1]) / 8]
  return {
    d,
    plugA: plugPath(from, unit(from, c1), plug, 3.2),
    plugB: plugPath(to, unit(to, c2), plug, 3.2),
    mid,
  }
}

/** A straight or gently curved connector used by schematics (no sag). `curve` bends it (px, perpendicular). */
export function connector(from: Pt, to: Pt, seed?: number | string, curve = 0): string {
  const mid: Pt = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
  const n = unit(from, to)
  const bent: Pt = [mid[0] - n[1] * curve, mid[1] + n[0] * curve]
  const points: Pt[] = curve === 0 ? [from, to] : [from, bent, to]
  return seed === undefined ? smoothPath(points) : penLine(points, seed, { amp: 0.7, step: 30 })
}

/** A chevron arrow head whose tip is at `tip`, pointing along `direction` (a unit vector). */
export function arrowHead(tip: Pt, direction: Pt, size = 7, seed?: number | string): string {
  const [dx, dy] = direction
  const nx = -dy
  const ny = dx
  const back: Pt = [tip[0] - dx * size, tip[1] - dy * size]
  const points: Pt[] = [
    [back[0] + nx * size * 0.62, back[1] + ny * size * 0.62],
    tip,
    [back[0] - nx * size * 0.62, back[1] - ny * size * 0.62],
  ]
  return seed === undefined
    ? points.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${fmt(px)} ${fmt(py)}`).join('')
    : crispLine(points, seed, 0.4)
}

// ---- relay ---------------------------------------------------------------------------------------

export interface RelayParts {
  /** The relay's housing. */
  body: string
  /** The winding on the left of the housing. */
  coil: string
  /** The iron core the winding is wound on. */
  core: string
  /** The yoke that carries the pivot. */
  yoke: string
  /** The contact arm at rest, drawn from `pivot` to `tip`. Rotate it about `pivot` (about 18 degrees) when a message passes. */
  arm: string
  /** SVG user-space coordinates of the arm's pivot: use as the transform origin. */
  pivot: Pt
  /** SVG user-space coordinates of the arm's tip at rest. */
  tip: Pt
  armLength: number
  /** The two fixed contacts the arm swings between. */
  contactLeft: Pt
  contactRight: Pt
  /** Screw terminals along the bottom edge. */
  terminals: Pt[]
  /** Bounding box of the housing. */
  box: { x: number; y: number; w: number; h: number }
}

/**
 * A relay: housing, winding, core, yoke, and a contact arm that physically throws. `size` is the
 * housing width; the housing is 0.8 x as tall. The arm rests vertical, ready to swing +/- 18 degrees
 * onto either contact.
 */
export function relay(cx: number, cy: number, size = 120, seed?: number | string): RelayParts {
  const s = size / 120
  const box = { x: cx - 60 * s, y: cy - 48 * s, w: 120 * s, h: 96 * s }
  const pivot: Pt = [cx + 30 * s, cy - 26 * s]
  const tip: Pt = [cx + 30 * s, cy + 26 * s]
  const coilPoints: Pt[] = Array.from({ length: 13 }, (_, i): Pt => [cx - 40 * s + (i % 2 === 0 ? -9 : 9) * s, cy - 30 * s + i * 5 * s])
  return {
    body: roundedRect(box.x, box.y, box.w, box.h, 7 * s, seed === undefined ? undefined : `${seed}:body`),
    coil: seed === undefined ? smoothPath(coilPoints) : smoothPath(wobblePoints(coilPoints, `${seed}:coil`, 0.5)),
    core: roundedRect(cx - 22 * s, cy - 32 * s, 8 * s, 64 * s, 2 * s, seed === undefined ? undefined : `${seed}:core`, 0.5),
    yoke: `M${fmt(cx - 18 * s)} ${fmt(cy - 32 * s)}H${fmt(cx + 30 * s)}V${fmt(cy - 26 * s)}`,
    arm: `M${fmt(pivot[0])} ${fmt(pivot[1])}L${fmt(tip[0])} ${fmt(tip[1])}`,
    pivot,
    tip,
    armLength: 52 * s,
    contactLeft: [cx + 14 * s, cy + 30 * s],
    contactRight: [cx + 46 * s, cy + 30 * s],
    terminals: [-42, -14, 14, 42].map((dx): Pt => [cx + dx * s, cy + 42 * s]),
    box,
  }
}

/** A rivet: a small circle (use with a filled paper tone and an ink stroke). */
export function rivet(cx: number, cy: number, r = 2.2): string {
  return circle(cx, cy, r)
}
