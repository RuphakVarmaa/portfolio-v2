import { createRng, fmt, type Pt } from '../../lib/draw/wobble.ts'
import { BEZEL_R, RELAY_JACKS, RELAY_SHARE, RELAY_VIEWBOX, type Jack, type RelayJackId } from './board-art.ts'
import { BOARD_SIZE, LAMP_ORDER, positionsFor, toUnits, type LampId, type LayoutKind } from './lamp-positions.ts'

/**
 * The patch cables (spec 2.5, 4.1): where each plug sits and how each cable hangs, as pure functions that
 * return SVG path strings. Client only: the cables draw themselves the first time the board is on screen, so
 * this module is imported lazily with `Cables.tsx` and stays out of the first bundle. Same rules as
 * `board-art.ts`: seeded, deterministic, no DOM, no trigonometry.
 *
 * Plain `.ts` on purpose (no JSX): `node --test` imports it directly.
 */

const HEX_H = 0.8660254037844386

/** Bezel circumradius on the board, per layout (board units). */
export const LAMP_BEZEL: Readonly<Record<LayoutKind, number>> = { wide: BEZEL_R, narrow: 36 }
/** The SENSORS lamp is a smaller lamp (it is an input, not a service). */
export const SENSORS_BEZEL: Readonly<Record<LayoutKind, number>> = { wide: 40, narrow: 29 }

const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]]
const scale = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k]
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1]
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const P = (p: Pt) => `${fmt(p[0])} ${fmt(p[1])}`

type Face = 'left' | 'right' | 'top' | 'bottom'

/** Jack points on a lamp's bezel (the hexagon's circumradius for the side vertices, 0.866 of it for the flat edges). */
function lampJack(centre: Pt, bezel: number, face: Face): Jack {
  switch (face) {
    case 'left':
      return { at: [centre[0] - bezel, centre[1]], dir: [-1, 0] }
    case 'right':
      return { at: [centre[0] + bezel, centre[1]], dir: [1, 0] }
    case 'top':
      return { at: [centre[0], centre[1] - bezel * HEX_H], dir: [0, -1] }
    case 'bottom':
      return { at: [centre[0], centre[1] + bezel * HEX_H], dir: [0, 1] }
  }
}

// ---- plugs and cables ------------------------------------------------------------------------------

/** How far a plug's body reaches out of its jack; the cable starts at the end of its strain relief. */
export const PLUG_OUT = 30
/** The plug's length on the narrow board, where the cables are shorter. */
export const PLUG_OUT_NARROW = 24

export interface Plug {
  /** The metal: ferrule and barrel (filled with paper, outlined in ink). */
  metal: string
  /** The cable's strain relief (filled with ink). */
  boot: string
  /** Where the cable itself begins. */
  end: Pt
}

/** A patch-cable plug entering `jack.at` along `-jack.dir`. Most of the ferrule is hidden under the device it plugs into. `out` is how far it reaches (the cable starts there). */
export function plug(jack: Jack, out = PLUG_OUT): Plug {
  const n: Pt = [-jack.dir[1], jack.dir[0]]
  const pt = (along: number, side: number): Pt => [jack.at[0] + jack.dir[0] * along + n[0] * side, jack.at[1] + jack.dir[1] * along + n[1] * side]
  const poly = (points: Pt[]) => `M${points.map(P).join('L')}Z`
  const k = out / PLUG_OUT
  const ferrule = poly([pt(-12, -3.4), pt(3, -3.4), pt(3, 3.4), pt(-12, 3.4)])
  const barrel = poly([pt(3, -6.2), pt(3 + 14 * k, -6.2), pt(3 + 14 * k, 6.2), pt(3, 6.2)])
  const collar = `M${P(pt(3 + 7 * k, -6.2))}L${P(pt(3 + 7 * k, 6.2))}`
  const boot = poly([pt(3 + 14 * k, -5.4), pt(out, -2.6), pt(out, 2.6), pt(3 + 14 * k, 5.4)])
  return { metal: ferrule + barrel + collar, boot, end: pt(out, 0) }
}

export interface CableOptions {
  /** Gravity: pushes both control points down, so the cable hangs (px). */
  sag: number
  /** Sideways slack for cables that hang vertically (px, signed). */
  bow: number
  seed: string
}

/** One patch cable between two plug ends: a cubic that leaves each plug along its axis. Returns the `d` string and the curve's midpoint (where a tag can hang). */
export function cableCurve(start: Pt, startDir: Pt, end: Pt, endDir: Pt, options: CableOptions): { d: string; mid: Pt } {
  const rng = createRng(`${options.seed}:cable`)
  const jitter = () => (rng() - 0.5) * 2.4
  const delta: Pt = [end[0] - start[0], end[1] - start[1]]
  const reachA = clamp(Math.abs(dot(delta, startDir)) * 0.5, 22, 130)
  const reachB = clamp(Math.abs(dot(delta, endDir)) * 0.5, 22, 130)
  const c1 = add(add(start, scale(startDir, reachA)), [options.bow + jitter(), options.sag + jitter()])
  const c2 = add(add(end, scale(endDir, reachB)), [options.bow + jitter(), options.sag + jitter()])
  // Cubic midpoint (t = 0.5): (p0 + 3 c1 + 3 c2 + p3) / 8.
  const mid: Pt = [(start[0] + 3 * c1[0] + 3 * c2[0] + end[0]) / 8, (start[1] + 3 * c1[1] + 3 * c2[1] + end[1]) / 8]
  return { d: `M${P(start)}C${P(c1)} ${P(c2)} ${P(end)}`, mid }
}

// ---- a whole layout --------------------------------------------------------------------------------

export interface CableGeometry {
  id: LampId
  /** Stagger index for the boot draw (90 ms per cable). */
  index: number
  /** The cable, from the relay end to the lamp end (so a pulse "out" runs relay to lamp). */
  d: string
  /** Halfway along it: where the numbered tag hangs. */
  mid: Pt
  /** Plug at the relay end, plug at the lamp end. */
  plugs: readonly [Plug, Plug]
}

export interface LayoutGeometry {
  kind: LayoutKind
  width: number
  height: number
  /** Where the relay's drawing sits on the board, in board units. */
  relay: { x: number; y: number; w: number; h: number; scale: number }
  /** Lamp centres in board units. */
  lamps: Readonly<Record<LampId, Pt>>
  cables: readonly CableGeometry[]
}

interface Wiring {
  lampFace: Face
  relayJack: RelayJackId
}

const WIRING: Readonly<Record<LayoutKind, Readonly<Record<LampId, Wiring>>>> = {
  wide: {
    retrieval: { lampFace: 'right', relayJack: 'left-top' },
    vision: { lampFace: 'left', relayJack: 'right-top' },
    policy: { lampFace: 'right', relayJack: 'left-bottom' },
    review: { lampFace: 'left', relayJack: 'right-bottom' },
    sensors: { lampFace: 'top', relayJack: 'bottom-center' },
  },
  narrow: {
    retrieval: { lampFace: 'bottom', relayJack: 'top-left' },
    vision: { lampFace: 'bottom', relayJack: 'top-right' },
    policy: { lampFace: 'top', relayJack: 'bottom-left' },
    review: { lampFace: 'top', relayJack: 'bottom-right' },
    // Below the relay, as on the landscape board: out of the bottom-centre socket, down to the lamp's top.
    sensors: { lampFace: 'top', relayJack: 'bottom-center' },
  },
}

/** How each cable hangs: gravity on the wide board, a little sideways slack on the tall one. */
const SLACK: Readonly<Record<LayoutKind, Readonly<Record<LampId, { sag: number; bow: number }>>>> = {
  wide: {
    retrieval: { sag: 34, bow: 0 },
    vision: { sag: 30, bow: 0 },
    policy: { sag: 38, bow: 0 },
    review: { sag: 34, bow: 0 },
    sensors: { sag: 0, bow: 14 },
  },
  narrow: {
    retrieval: { sag: 0, bow: -20 },
    vision: { sag: 0, bow: 20 },
    policy: { sag: 0, bow: -20 },
    review: { sag: 0, bow: 20 },
    sensors: { sag: 0, bow: 10 },
  },
}

export function layoutGeometry(kind: LayoutKind): LayoutGeometry {
  const { width, height } = BOARD_SIZE[kind]
  const positions = positionsFor(kind)
  const centre = toUnits(kind, positions.controlPlane)
  const relayW = width * RELAY_SHARE[kind]
  const k = relayW / RELAY_VIEWBOX.width
  const relay = { x: centre.x - relayW / 2, y: centre.y - (RELAY_VIEWBOX.height * k) / 2, w: relayW, h: RELAY_VIEWBOX.height * k, scale: k }

  const lamps = {} as Record<LampId, Pt>
  for (const id of LAMP_ORDER) {
    const u = toUnits(kind, positions[id])
    lamps[id] = [u.x, u.y]
  }

  const cables = LAMP_ORDER.map((id, index): CableGeometry => {
    const wiring = WIRING[kind][id]
    const bezel = id === 'sensors' ? SENSORS_BEZEL[kind] : LAMP_BEZEL[kind]
    const lampJackPoint = lampJack(lamps[id], bezel, wiring.lampFace)
    const local = RELAY_JACKS[wiring.relayJack]
    const relayJack: Jack = { at: [relay.x + local.at[0] * k, relay.y + local.at[1] * k], dir: local.dir }
    const out = kind === 'wide' ? PLUG_OUT : PLUG_OUT_NARROW
    const relayPlug = plug(relayJack, out)
    const lampPlug = plug(lampJackPoint, out)
    const slack = SLACK[kind][id]
    const { d, mid } = cableCurve(relayPlug.end, relayJack.dir, lampPlug.end, lampJackPoint.dir, { ...slack, seed: `board:${kind}:${id}` })
    return { id, index, d, mid, plugs: [relayPlug, lampPlug] }
  })

  return { kind, width, height, relay, lamps, cables }
}
