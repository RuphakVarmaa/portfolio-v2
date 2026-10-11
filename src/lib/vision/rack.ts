/**
 * The queue as a picture (spec 4.4): the real contents of the bounded ring, laid out as a rack of slots the
 * panel can draw. Pure data and layout, no DOM: the engine fills a `RackState` from what is really in the
 * ring (and what the ring really evicted), and `layoutRack` turns it into positions. Nothing here invents
 * a card: a card in the rack is a frame or a motion sample the pipeline really holds.
 *
 * Reading direction (left to right, the same as the schematic): producers push in at the left end, the
 * worker takes from the right end. Slot `capacity - 1` is the HEAD, the oldest item and the next one the
 * worker will take; slot 0 is where the newest lands when the rack is full. The worker's bay sits after the
 * last slot, at index `capacity`.
 */

/** One thing in the queue, as the rack draws it. */
export interface RackCard {
  /** Unique for the session; the React key and what makes a card slide instead of reappearing. */
  id: number
  kind: 'frame' | 'motion'
  /** Frames: the capture number in this session (`#12`). Motion: the sample number. */
  n: number
  /** Frames: the captured RGBA pixels the thumbnail is made from. Motion: null. */
  raw: Uint8ClampedArray | null
  width: number
  height: number
  /** Motion: the three axes of the sample in m/s^2 (the card draws them as bars). Frames: null. */
  axes: readonly [number, number, number] | null
}

export interface RackState {
  /** What the queue holds at the last update, oldest first. */
  queued: readonly RackCard[]
  /** What the worker took most recently. */
  working: RackCard | null
  /** The worker is processing it right now. */
  busy: boolean
  /** Evicted a moment ago, still on show while they are bumped out. */
  lost: readonly RackCard[]
  /** Bumps when the colours change, so thumbnails repaint. */
  tone: number
}

export const EMPTY_RACK: RackState = Object.freeze({ queued: [], working: null, busy: false, lost: [], tone: 0 })

export interface RackPlacement {
  card: RackCard
  /** 0 .. capacity - 1 are the rack's slots; `capacity` is the worker's bay. */
  slot: number
  /** An evicted card on its way out (drawn at the head slot, bumped out and faded). */
  ghost: boolean
}

/**
 * Where every card goes. A card is drawn once: if the worker has taken it (it is `working`) it is in the bay
 * even if the fullest-moment snapshot still lists it as queued, and an evicted card is only ever a ghost.
 */
export function layoutRack(state: RackState, capacity: number): RackPlacement[] {
  const placements: RackPlacement[] = []
  const used = new Set<number>()
  const place = (card: RackCard, slot: number, ghost: boolean) => {
    if (used.has(card.id)) return
    used.add(card.id)
    placements.push({ card, slot, ghost })
  }
  if (state.working) place(state.working, capacity, false)
  for (const card of state.lost) place(card, capacity - 1, true)
  // Oldest first: the oldest is the head. A rack never shows more than it holds.
  const queued = state.queued.filter((card) => !used.has(card.id)).slice(-capacity)
  queued.forEach((card, index) => place(card, capacity - 1 - index, false))
  return placements
}

/** Do two lists hold the same cards in the same order? (By id: a card's pixels never change.) */
export function sameCards(a: readonly RackCard[], b: readonly RackCard[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i].id !== b[i].id) return false
  return true
}

/** An evicted card and when it was evicted. */
export interface LostCard {
  card: RackCard
  at: number
}

/** The evicted cards still worth showing at `now`, newest last, at most `max` of them. */
export function recentlyLost(lost: readonly LostCard[], now: number, keepMs: number, max: number): LostCard[] {
  return lost.filter((entry) => now - entry.at < keepMs).slice(-max)
}

/**
 * The three axes of a motion sample as deflections from the centre line, each in -1..1. A phone lying still
 * reads about +9.8 on one axis (gravity); a hard shake reaches 20 or more, which is where the bar tops out.
 */
export function axisDeflections(axes: readonly [number, number, number], full = 20): [number, number, number] {
  const clamp = (value: number) => Math.max(-1, Math.min(1, value / full))
  return [clamp(axes[0]), clamp(axes[1]), clamp(axes[2])]
}
