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

/**
 * One cell of a ledger whose unit is in its label (the fuzz's batch ledger, `Batches · worker, ms`): `4.0`, `4.7`, `12`.
 * One decimal under 10 and none from 10 up, always, so the trailing `.0` stays and a row of cells reads alike
 * (a bare `4` next to a `4.7` looks like a different instrument).
 */
export function formatCell(ms: number): string {
  if (!(ms > 0)) return '0.0'
  const tenth = Math.round(ms * 10) / 10
  // 9.96 rounds up to 10.0 here; from 10 up the rule is no decimals, so it prints `10`, not `10.0`.
  return tenth < 10 ? tenth.toFixed(1) : String(Math.round(ms))
}

/**
 * Decimals that keep two significant figures of a time in milliseconds, and never more than two, so a cell stays within
 * seven characters (`27 ms`, `4.0 ms`, `0.50 ms`): the stage cards and the narrow stage rows are about that wide.
 */
const decimalsFor = (value: number): number => (value >= 10 ? 0 : value >= 1 ? 1 : 2)

/** Two significant figures (whole numbers from 10 up), the trailing zero kept; rounding up across a boundary (9.96 to 10) re-reads the value. */
function twoFigures(value: number): string {
  const first = Number(value.toFixed(decimalsFor(value)))
  return first.toFixed(decimalsFor(first))
}

/**
 * Microseconds: from 10 up whole numbers (`1520`, no grouping: `1,520 µs` is too wide for a stage card, and a set that
 * reaches 10 ms is in milliseconds, so it is never more than four digits); under 10 one decimal, floored at 0.1 like
 * `formatDuration`.
 */
function microseconds(ms: number): string {
  const us = ms * 1000
  const tenth = Math.round(us * 10) / 10
  return tenth >= 10 ? String(Math.round(us)) : Math.max(0.1, tenth).toFixed(1)
}

/**
 * How to print a SET of durations that sit side by side (the five stage cards, the parts of a schematic, the stage
 * list): one unit for all of them and one precision rule for every cell, the trailing zero kept: whole numbers from 10
 * up, one decimal from 1 to 10 (two under 1 in milliseconds), so every cell has two figures or more. `formatDuration`
 * is for one time inside a sentence and picks its own unit; side by side that gives `0.5 ms` next to `54 µs` and a
 * bare `2 µs` next to `3.3 µs`, which reads as cells from different instruments.
 *
 * The unit is milliseconds when the smallest time is at least 0.1 ms (every cell then keeps two figures with at most
 * two decimals) or when the largest is 10 ms or more (a long paste: five-digit microseconds do not fit a card), and
 * microseconds otherwise. A review of a seeded diff has stages from about 1 ms down to a few microseconds, so it
 * prints `1520 µs`, `270 µs`, `3.3 µs`; the policy fuzz's stages print `28 ms`, `0.60 ms`, `0.40 ms`.
 *
 * Build it from every time the set will ever show, not from the ones on screen so far, or the unit would change
 * while a slow-motion replay reveals the stages one by one. Zero (a stage that did not run) is not a measurement and
 * does not choose the unit.
 */
export function durationFormatter(times: readonly number[]): (ms: number) => string {
  const measured = times.filter((time) => time > 0 && Number.isFinite(time))
  if (measured.length === 0) return formatDuration
  const milliseconds = Math.min(...measured) >= 0.1 || Math.max(...measured) >= 10
  if (milliseconds) {
    // Under 5 microseconds the second decimal would read 0.00: say "under", never zero, for work that took time.
    return (ms) => (!(ms > 0) ? '0 ms' : ms < 0.005 ? '<0.01 ms' : `${twoFigures(ms)} ms`)
  }
  return (ms) => (!(ms > 0) ? '0 µs' : `${microseconds(ms)} µs`)
}
