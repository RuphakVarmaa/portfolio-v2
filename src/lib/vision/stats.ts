/**
 * The small statistics behind the Vision gauges (spec 4.4): the p95 of the last 60 inferences and the
 * sustained frame rate over 3 seconds. Pure functions and tiny stateful helpers, no DOM, fully tested.
 *
 * Every number the panel shows as "measured" comes from one of these fed with real timings; nothing here
 * has a built-in value.
 */

/**
 * Nearest-rank percentile (`p` in 0..100) of `values`, or `null` when there are none. For 60 samples the
 * 95th percentile is the 57th smallest: the value 95% of the samples do not exceed.
 */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((Math.min(100, Math.max(0, p)) / 100) * sorted.length)
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]
}

export interface RollingWindow {
  /** Add a sample; the oldest is forgotten once the window is full. */
  push(value: number): void
  /** How many samples are held (at most `size`). */
  readonly count: number
  /** The held samples, oldest first. */
  values(): number[]
  /** Nearest-rank percentile of the held samples, or null when empty. */
  percentile(p: number): number | null
  clear(): void
}

/** A window over the most recent `size` samples. */
export function createWindow(size: number): RollingWindow {
  if (!Number.isInteger(size) || size < 1) throw new RangeError(`A window needs an integer size of at least 1 (got ${String(size)})`)
  const samples: number[] = []
  return {
    push(value) {
      samples.push(value)
      if (samples.length > size) samples.shift()
    },
    get count() {
      return samples.length
    },
    values: () => samples.slice(),
    percentile: (p) => percentile(samples, p),
    clear() {
      samples.length = 0
    },
  }
}

export interface RateMeter {
  /** Record one completion at time `at` (ms, any monotonic clock). */
  mark(at: number): void
  /**
   * Completions per second over the last `windowMs`, or null until there is enough to say (two marks and
   * `minSpanMs` since the first). Before the window has filled it uses the time actually elapsed, so the
   * first seconds are not under-reported.
   */
  perSecond(now: number): number | null
  clear(): void
}

export function createRateMeter(windowMs = 3000, minSpanMs = 500): RateMeter {
  let marks: number[] = []
  let firstAt: number | null = null
  return {
    mark(at) {
      firstAt ??= at
      marks.push(at)
    },
    perSecond(now) {
      if (firstAt === null) return null
      marks = marks.filter((t) => t > now - windowMs)
      const elapsed = now - firstAt
      if (elapsed < minSpanMs) return null
      if (elapsed >= windowMs) return marks.length / (windowMs / 1000)
      // The window has not filled yet: n marks span n - 1 intervals.
      return marks.length < 2 ? null : (marks.length - 1) / (elapsed / 1000)
    },
    clear() {
      marks = []
      firstAt = null
    },
  }
}
