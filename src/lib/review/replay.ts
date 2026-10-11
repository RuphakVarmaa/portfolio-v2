/**
 * Slow-motion replay of a finished run: the "Show me the pipeline" button (spec 4.2).
 *
 * The stages of a real run take microseconds, so as they genuinely arrive (one `progress` message each) they
 * land inside a single frame and nobody can follow the order they happened in. "Show me the pipeline" therefore
 * replays the stages the run measured, one per step, so the schematic lights in the order the work was done.
 * The stage names and the times are the ones the run measured; only the pacing is for people, and the panel
 * says so in words next to the drawing.
 *
 * The step is the site's own `--dur-2` motion token (240 ms), which is 0 ms under lite motion and reduced
 * motion, so a replay under lite shows every stage at once ("under lite the list fills instantly on
 * completion", spec 4.2). Plain TypeScript with injectable timers, so `node --test` drives it with a fake clock.
 */

export interface ReplayTimers {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

const browserTimers: ReplayTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/**
 * Reveal `total` stages: the first at once, then one more every `stepMs`. `onStep` receives how many are
 * revealed so far (1 .. total). A step of 0 or less reveals them all at once. Returns a function that
 * stops the replay where it is.
 */
export function startReplay(total: number, stepMs: number, onStep: (shown: number) => void, timers: ReplayTimers = browserTimers): () => void {
  if (total <= 0) return () => undefined
  if (!(stepMs > 0)) {
    onStep(total)
    return () => undefined
  }
  let shown = 0
  let handle: unknown
  let stopped = false
  const advance = () => {
    if (stopped) return
    shown += 1
    onStep(shown)
    if (shown < total) handle = timers.set(advance, stepMs)
  }
  advance()
  return () => {
    stopped = true
    if (handle !== undefined) timers.clear(handle)
  }
}

/** A CSS time (`240ms`, `0.24s`, `0ms`) in milliseconds; 0 when it is not one. */
export function parseCssTime(value: string): number {
  const text = value.trim()
  const number = Number.parseFloat(text)
  if (!Number.isFinite(number)) return 0
  return text.endsWith('ms') ? number : text.endsWith('s') ? number * 1000 : 0
}

/** The replay step: the `--dur-2` token (240 ms; 0 under lite motion). 0 when there is no document to read it from. */
export function readStepMs(): number {
  if (typeof document === 'undefined') return 0
  return parseCssTime(getComputedStyle(document.documentElement).getPropertyValue('--dur-2'))
}
