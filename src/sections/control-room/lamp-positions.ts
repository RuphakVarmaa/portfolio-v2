/**
 * Where everything sits on the board (spec 4.1). One source of truth for the layout: the CSS custom
 * properties on each lamp, the cable endpoints in `board-cables.ts` and the tests all read it.
 *
 * Coordinates are percent of the board box, the centre of each part. The board has two layouts of the
 * same switchboard (same topology, different proportions): a landscape one for wide containers and a
 * portrait one for phones, chosen by a container query (see ControlRoom.module.css).
 *
 * Plain `.ts` on purpose: `node --test` imports this file directly.
 */

export type LampId = 'retrieval' | 'vision' | 'policy' | 'review' | 'sensors'
export type AnchorId = LampId | 'controlPlane'
export type LayoutKind = 'wide' | 'narrow'

export interface Anchor {
  readonly x: number
  readonly y: number
}

/** Spec 4.1: control plane (50, 50); retrieval (18, 28); vision (82, 28); policy (18, 76); review (82, 76); sensors (50, 90). */
export const LAMP_POSITIONS: Readonly<Record<AnchorId, Anchor>> = {
  controlPlane: { x: 50, y: 50 },
  retrieval: { x: 18, y: 28 },
  vision: { x: 82, y: 28 },
  policy: { x: 18, y: 76 },
  review: { x: 82, y: 76 },
  sensors: { x: 50, y: 90 },
}

/**
 * The phone layout: a portrait box, the relay in the middle, a lamp in each corner with its nameplate on
 * the outer side (above the top lamps, below the bottom ones), and the SENSORS lamp between the two top
 * lamps, wired straight down into the relay between their cables, its tag hanging on the cable.
 */
export const LAMP_POSITIONS_NARROW: Readonly<Record<AnchorId, Anchor>> = {
  controlPlane: { x: 50, y: 50 },
  retrieval: { x: 26, y: 21.5 },
  vision: { x: 74, y: 21.5 },
  policy: { x: 26, y: 78.5 },
  review: { x: 74, y: 78.5 },
  sensors: { x: 50, y: 21.5 },
}

/** The drawing's coordinate space for each layout (SVG viewBox units). The CSS aspect ratios must match these. */
export const BOARD_SIZE: Readonly<Record<LayoutKind, { readonly width: number; readonly height: number }>> = {
  wide: { width: 1200, height: 720 },
  narrow: { width: 400, height: 780 },
}

/** Lamps in reading order. SENSORS is last: it only exists on devices that report motion sensors. */
export const LAMP_ORDER: readonly LampId[] = ['retrieval', 'vision', 'policy', 'review', 'sensors']

/** The four services that have a worker behind them (every lamp but SENSORS). */
export const SERVICE_LAMPS = ['retrieval', 'vision', 'policy', 'review'] as const

/** The lamps in the top row: their nameplate sits above the lamp (the other lamps' nameplates sit below). */
export const TOP_ROW: readonly LampId[] = ['retrieval', 'vision']

/** Each lamp is mounted by hand, a degree or two off true (degrees): the same bezel, five slightly different lamps. */
export const LAMP_TILT: Readonly<Record<LampId, number>> = { retrieval: -2.2, vision: 1.6, policy: -1.1, review: 2.4, sensors: -1.8 }

export function positionsFor(kind: LayoutKind): Readonly<Record<AnchorId, Anchor>> {
  return kind === 'wide' ? LAMP_POSITIONS : LAMP_POSITIONS_NARROW
}

/** A percent position in viewBox units. */
export function toUnits(kind: LayoutKind, anchor: Anchor): { x: number; y: number } {
  const { width, height } = BOARD_SIZE[kind]
  return { x: (anchor.x / 100) * width, y: (anchor.y / 100) * height }
}
