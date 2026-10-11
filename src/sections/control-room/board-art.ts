import { hexagon } from '../../lib/draw/paths.ts'
import { fmt, penLine, type Pt } from '../../lib/draw/wobble.ts'

/**
 * The switchboard's drawing (spec 2.5, 4.1): pure functions that return SVG path strings and numbers.
 * Nothing here touches the DOM, so the server and the client draw exactly the same thing (hydration-safe),
 * the tests can pin it, and `docs/style-frame.html` is made from the same code. Everything is a function of
 * its arguments plus fixed seeds (`board:...`): no Math.random, no Date, no trigonometry.
 *
 * This file is what the prerendered HTML needs: the lamp, the relay, the hexagon. The patch cables (client
 * only, drawn when the board is first on screen) live in `board-cables.ts`, so their code is not in the
 * first bundle.
 *
 * Plain `.ts` on purpose (no JSX): `node --test` imports it directly.
 */

/** The lamp art is drawn once, at the origin, with this lens radius; CSS scales it for each layout. */
export const LENS_R = 38
export const BEZEL_RATIO = 1.34
/** Circumradius of the hexagonal bezel in the lamp art's own units (the helper `lamp()` in draw/paths.ts uses the same ratio). */
export const BEZEL_R = LENS_R * BEZEL_RATIO

/** Glow rings of a lit lamp (spec 2.5: 100/60/30/12 %), as multiples of the lens radius. The lens is the 100 % ring. */
const ring = (k: number) => Math.round(LENS_R * k * 100) / 100
export const GLOW_RINGS: readonly { readonly r: number; readonly level: 1 | 2 | 3 }[] = [
  { r: ring(2.7), level: 3 }, // 12 %
  { r: ring(2.1), level: 2 }, // 30 %
  { r: ring(1.55), level: 1 }, // 60 %
]

/** Half the width of the lamp art's viewBox: the bezel, its hard shadow and a little air. */
export const LAMP_HALF = Math.ceil(BEZEL_R + 4)
/** The lamp art's width in board units (the CSS sizes the lamp as this share of the board's width). */
export const LAMP_ART_W = LAMP_HALF * 2

export interface LampArt {
  /** viewBox of the art: centred on the lamp, just the bezel (the glow overflows it on purpose). */
  viewBox: string
  /** Hexagonal bezel (hand-drawn). */
  bezel: string
  /** A slightly larger hexagon: the keyboard-focus ring. */
  focus: string
  /** Glow rings, largest first. */
  rings: readonly { r: number; level: 1 | 2 | 3 }[]
  lensR: number
  grooveR: number
  innerR: number
  /** A short arc of glare on the lens. */
  glare: string
  /** The two halves of the lens, drawn over it when one worker of a two-worker service is down. */
  halves: { left: string; right: string }
  /** Hard offset of the shadow (the keycap look, same as the buttons). */
  shadow: number
}

export function lampArt(): LampArt {
  const half = (sweep: 0 | 1) => `M0 ${-LENS_R}A${LENS_R} ${LENS_R} 0 0 ${sweep} 0 ${LENS_R}Z`
  return {
    viewBox: `${-LAMP_HALF} ${-LAMP_HALF} ${LAMP_ART_W} ${LAMP_ART_W}`,
    bezel: hexagon(0, 0, BEZEL_R, 'board:lamp:bezel', 0.7),
    focus: hexagon(0, 0, BEZEL_R + 10, 'board:lamp:focus', 0.4),
    rings: GLOW_RINGS,
    lensR: LENS_R,
    grooveR: LENS_R + 6.5,
    innerR: LENS_R - 8,
    glare: `M${fmt(-LENS_R * 0.62)} ${fmt(-LENS_R * 0.18)}Q${fmt(-LENS_R * 0.5)} ${fmt(-LENS_R * 0.68)} ${fmt(-LENS_R * 0.06)} ${fmt(-LENS_R * 0.74)}`,
    halves: { left: half(0), right: half(1) },
    shadow: 3.5,
  }
}

/** The hexagon every section number carries (the same path as `Section`'s bezel, so the hero's "01" matches "02" to "07"), in a 48 x 48 box. */
export function hexBezel(): string {
  return hexagon(24, 24, 20, 'section:bezel', 0.7)
}

// ---- relay -----------------------------------------------------------------------------------------

/** The relay's own drawing space. CSS scales it to 25 % of the board width (wide) or 43 % (narrow). */
export const RELAY_VIEWBOX = { width: 300, height: 300 } as const
/** Relay width as a fraction of the board width, per layout (ControlRoom.module.css uses the same numbers, in percent). */
export const RELAY_SHARE = { wide: 0.25, narrow: 0.43 } as const

/** The arm's pivot and length in the relay's drawing space; contacts sit where the arm lands at +-18 degrees. */
export const ARM_PIVOT: Pt = [206, 34]
export const ARM_LENGTH = 92
export const ARM_THROW_DEG = 18
/** Where the arm's tip lands at +-18 degrees: 92 x sin(18) = 28.4 either side of the pivot, 92 x cos(18) = 87.5 below it. */
export const CONTACTS: readonly Pt[] = [
  [178, 124],
  [234, 124],
]
/** The recessed window that carries the NODES / TERM display (HTML is laid over it; ControlRoom.module.css uses 8 % / 54.67 % / 84 % / 40 %). */
export const RELAY_WINDOW = { x: 24, y: 164, w: 252, h: 120 } as const

export type RelayJackId =
  | 'left-top'
  | 'left-bottom'
  | 'right-top'
  | 'right-bottom'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export interface Jack {
  /** Where the plug enters the device (on its edge), in the space of whatever is being drawn. */
  at: Pt
  /** Unit vector pointing away from the device: the way the plug and the cable leave. */
  dir: Pt
}

/** Sockets on the relay housing, in the relay's drawing space (300 x 300). Wide uses the side ones and bottom-center; narrow the top and bottom ones. */
export const RELAY_JACKS: Readonly<Record<RelayJackId, Jack>> = {
  'left-top': { at: [0, 72], dir: [-1, 0] },
  'left-bottom': { at: [0, 228], dir: [-1, 0] },
  'right-top': { at: [300, 72], dir: [1, 0] },
  'right-bottom': { at: [300, 228], dir: [1, 0] },
  'top-left': { at: [96, 0], dir: [0, -1] },
  'top-center': { at: [150, 0], dir: [0, -1] },
  'top-right': { at: [204, 0], dir: [0, -1] },
  'bottom-left': { at: [96, 300], dir: [0, 1] },
  'bottom-center': { at: [150, 300], dir: [0, 1] },
  'bottom-right': { at: [204, 300], dir: [0, 1] },
}

export const JACK_R = 8

export interface RelayArt {
  viewBox: string
  /** The housing. Drawn once and reused (`<use>`) for its hard offset shadow. */
  body: string
  /** The core's winding: one vertical line the stylesheet draws as a ladder of strokes (a dashed, thick stroke), plus the two flanges that hold it. */
  winding: string
  flanges: string
  /** The iron core the winding sits on. */
  core: string
  /** Bracket from the core over to the arm's pivot. */
  yoke: string
  /** The arm, drawn hanging from the origin (translate to `pivot` and rotate about 0,0). */
  arm: string
  pivot: Pt
  /** Where the brass tip sits on the arm, relative to the pivot. */
  armTip: Pt
  /** Fixed contacts, and the posts they stand on. */
  contacts: readonly Pt[]
  posts: string
  screws: readonly Pt[]
  screwSlots: string
  /** The recessed display window: an outer and an inner frame. */
  window: { outer: string; inner: string }
  jacks: readonly Pt[]
  jackR: number
  /** The relay's "coil energised" lamp. */
  coilLamp: Pt
}

/** Round every number in a path to one decimal: a tenth of a unit is a tenth of a pixel, and it saves a quarter of the bytes. */
const oneDecimal = (d: string) => d.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 10) / 10))

export function relayArt(): RelayArt {
  const { width: W, height: H } = RELAY_VIEWBOX
  const r = 16
  // Eight points: the rounded rectangle's four sides, each corner cut. A closed spline through them,
  // subdivided every 100 units and jittered by the pen, reads as one hand-drawn housing in ~0.5 KB.
  const outline: Pt[] = [
    [r, 0],
    [W - r, 0],
    [W, r],
    [W, H - r],
    [W - r, H],
    [r, H],
    [0, H - r],
    [0, r],
  ]
  const screws: Pt[] = [
    [17, 17],
    [W - 17, 17],
    [17, H - 17],
    [W - 17, H - 17],
  ]
  const slot = (p: Pt, tilt: number) => `M${fmt(p[0] - 3.4)} ${fmt(p[1] - tilt)}L${fmt(p[0] + 3.4)} ${fmt(p[1] + tilt)}`
  const win = RELAY_WINDOW
  return {
    viewBox: `0 0 ${W} ${H}`,
    body: oneDecimal(penLine(outline, 'board:relay:body', { step: 100, amp: 0.9, closed: true })),
    winding: 'M76 42V132',
    flanges: 'M44 34H108M44 138H108',
    core: 'M68 34H86V138H68Z',
    yoke: `M86 34V22H${fmt(ARM_PIVOT[0])}V${fmt(ARM_PIVOT[1] - 4)}`,
    arm: `M-4.5 5H4.5V${ARM_LENGTH - 7}L0 ${ARM_LENGTH}L-4.5 ${ARM_LENGTH - 7}Z`,
    pivot: ARM_PIVOT,
    armTip: [0, ARM_LENGTH - 6],
    contacts: CONTACTS,
    posts: CONTACTS.map((c) => `M${fmt(c[0])} ${fmt(c[1] + 5)}V148`).join(''),
    screws,
    screwSlots: screws.map((p, i) => slot(p, i % 2 === 0 ? 1.2 : -1.2)).join(''),
    window: {
      outer: `M${win.x} ${win.y}H${win.x + win.w}V${win.y + win.h}H${win.x}Z`,
      inner: `M${win.x + 5} ${win.y + 5}H${win.x + win.w - 5}V${win.y + win.h - 5}H${win.x + 5}Z`,
    },
    jacks: Object.values(RELAY_JACKS).map((j) => j.at),
    jackR: JACK_R,
    coilLamp: [258, 28],
  }
}
