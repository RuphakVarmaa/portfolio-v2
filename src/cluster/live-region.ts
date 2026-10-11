/**
 * The one polite live region for the whole site (rendered by <LiveRegion/> in the App shell).
 *
 * `announce(text)` never writes to the DOM directly. It is throttled to one update per 800 ms with
 * coalescing: the first call speaks at once (leading edge); anything announced inside the window is
 * queued, de-duplicated and delivered together at the end of the window as one sentence. That keeps a
 * burst of worker `ready` events or tape lines from machine-gunning a screen reader.
 */

export type Politeness = 'polite' | 'assertive'

export interface LiveSnapshot {
  polite: string
  assertive: string
}

/** A no-break space (U+00A0), built from its code so the source file has no invisible characters. */
const NBSP = String.fromCharCode(0xa0)

export const THROTTLE_MS = 800
/** The region is emptied after this long without announcements so stale text is not left for a virtual cursor. */
export const CLEAR_AFTER_MS = 12_000

export const EMPTY_LIVE: LiveSnapshot = Object.freeze({ polite: '', assertive: '' })

export interface AnnouncerDeps {
  now: () => number
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
}

export interface Announcer {
  announce(text: string, politeness?: Politeness): void
  getSnapshot(): LiveSnapshot
  subscribe(listener: () => void): () => void
}

export function createAnnouncer(overrides: Partial<AnnouncerDeps> = {}): Announcer {
  const deps: AnnouncerDeps = {
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    ...overrides,
  }
  const listeners = new Set<() => void>()
  const pending: Record<Politeness, string[]> = { polite: [], assertive: [] }
  /** Alternates so that announcing the same words twice still changes the DOM text. */
  const flip: Record<Politeness, boolean> = { polite: false, assertive: false }
  let snapshot: LiveSnapshot = EMPTY_LIVE
  let lastFlushAt = Number.NEGATIVE_INFINITY
  let flushTimer: unknown
  let clearTimer: unknown

  const publish = (next: LiveSnapshot) => {
    snapshot = next
    for (const listener of [...listeners]) listener()
  }

  const flush = () => {
    flushTimer = undefined
    lastFlushAt = deps.now()
    const next = { ...snapshot }
    let changed = false
    for (const politeness of ['polite', 'assertive'] as const) {
      const queue = pending[politeness]
      if (queue.length === 0) continue
      pending[politeness] = []
      flip[politeness] = !flip[politeness]
      next[politeness] = queue.join(' ') + (flip[politeness] ? NBSP : '')
      changed = true
    }
    if (!changed) return
    publish(next)
    if (clearTimer !== undefined) deps.clearTimer(clearTimer)
    clearTimer = deps.setTimer(() => {
      clearTimer = undefined
      publish(EMPTY_LIVE)
    }, CLEAR_AFTER_MS)
  }

  return {
    announce(text, politeness = 'polite') {
      const clean = text.replace(/\s+/g, ' ').trim()
      if (!clean) return
      const queue = pending[politeness]
      if (queue[queue.length - 1] !== clean) queue.push(clean)
      if (flushTimer !== undefined) return
      const wait = lastFlushAt + THROTTLE_MS - deps.now()
      if (wait <= 0) flush()
      else flushTimer = deps.setTimer(flush, wait)
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** The site's announcer. */
export const announcer: Announcer = createAnnouncer()

/** Announce `text` to assistive technology (throttled, coalesced). Safe to call from anywhere, including on the server (it queues and does nothing visible). */
export const announce: Announcer['announce'] = (text, politeness) => announcer.announce(text, politeness)
