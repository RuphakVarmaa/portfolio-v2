/**
 * Timing for work that is faster than the browser's clock.
 *
 * `performance.now()` is deliberately coarse on a page without cross-origin isolation (about 0.1 ms in
 * Chromium, 1 ms in Firefox and Safari), and one pass of most review stages takes a few microseconds to a
 * couple of milliseconds. Timing a single pass would print 0 ms or random rounding. So a stage is run once
 * for its real result, then repeated until enough time has passed for the clock to resolve, and the time
 * reported is the mean of the repeats. The panel says so next to the numbers.
 *
 * Pure apart from the injected clock: tests pass a fake one.
 */

export interface Timed<T> {
  /** What the first (cold) run returned. */
  value: T
  /** Mean milliseconds per run over the timed repeats (the cold first run is not counted). */
  ms: number
  /** How many repeats the mean is over. */
  runs: number
}

export interface TimeOptions {
  /** High-resolution milliseconds. Default `performance.now`. */
  clock?: () => number
  /** Keep repeating until at least this much time has been measured. Default 1.5 ms. */
  minMs?: number
  /** Never repeat more than this many times. Default 5000. */
  maxRuns?: number
}

/** Four decimals (0.1 microsecond): a mean over thousands of repeats is finer than the clock's own step. */
const round4 = (n: number) => Math.round(n * 10_000) / 10_000

/**
 * Every repeat stores its result here. A stage whose result nobody reads is pure work, and the JIT is free to
 * skip it: the repeats would then time nothing and print `0 ms` for a stage that costs microseconds. A store the
 * compiler cannot prove dead keeps the work in.
 */
const sink: { value: unknown } = { value: undefined }

export function timeRepeated<T>(fn: () => T, options: TimeOptions = {}): Timed<T> {
  const clock = options.clock ?? (() => performance.now())
  const minMs = options.minMs ?? 1.5
  const maxRuns = options.maxRuns ?? 5000

  // The first run supplies the value and warms the code; it is not part of the mean.
  const value = fn()

  let runs = 0
  let chunk = 1
  const started = clock()
  let elapsed = 0
  while (elapsed < minMs && runs < maxRuns) {
    const batch = Math.min(chunk, maxRuns - runs)
    for (let i = 0; i < batch; i++) sink.value = fn()
    runs += batch
    elapsed = clock() - started
    // Grow the batch so a very fast function does not read the clock after every call.
    chunk = Math.min(chunk * 2, 256)
  }
  return { value, ms: runs === 0 ? 0 : round4(elapsed / runs), runs }
}

/**
 * A measured duration for people. Stage times are a few microseconds, so milliseconds alone would print
 * `0 ms` for work that really ran: `412 ms`, `3.4 ms`, `0.42 ms`, `46 µs`, `0.4 µs`. Only a stage that did not run
 * (and so measured exactly 0) prints `0 ms`.
 */
export function formatDuration(ms: number): string {
  if (!(ms > 0)) return '0 ms'
  if (ms >= 10) return `${Math.round(ms)} ms`
  if (ms >= 1) return `${Math.round(ms * 10) / 10} ms`
  if (ms >= 0.1) return `${Math.round(ms * 100) / 100} ms`
  const us = ms * 1000
  return us >= 10 ? `${Math.round(us)} µs` : `${Math.max(0.1, Math.round(us * 10) / 10)} µs`
}
