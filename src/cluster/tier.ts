/**
 * Device tiering (spec 6.4). Runs once, synchronously, in `main.tsx` before any lazy chunk, and writes
 * the result to `html[data-tier]`. Every rule that fires is recorded as a plain-words reason, so the
 * Colophon can say exactly why this device got the tier it got.
 *
 *   full      everything on: the board, workers for all four services, camera + detector on tap
 *   standard  board updates coalesced to 30 fps, vision capture at 10 Hz, retrieval is BM25 until tapped
 *   basic     "skip the machine" is forced on; no camera, no model taps; static schematics + recorded traces
 */

export type Tier = 'full' | 'standard' | 'basic'

export interface TierInputs {
  simd: boolean
  cores: number
  memGB: number
  saveData: boolean
  slowNet: boolean
  reduce: boolean
  benchMs: number
  hasWorker: boolean
}

export interface TierInfo extends TierInputs {
  /** The tier in effect (the override when one is set). */
  tier: Tier
  /** What the rules chose before any override. */
  detected: Tier
  /** `localStorage['ruphak-tier']` when set from the Colophon, else null. */
  override: Tier | null
  /** Every rule that fired, in plain words, e.g. "2 CPU cores", "no WASM SIMD", "data saver on". */
  reasons: string[]
  /** What was measured, in plain words, whatever the tier (used when `reasons` is empty). */
  facts: string[]
}

export const TIER_STORAGE_KEY = 'ruphak-tier'

/**
 * Smallest valid module that uses a v128 value: `(func (result v128) v128.const i32x4 0 0 0 0)`.
 * `WebAssembly.validate` returns false on engines without fixed-width SIMD (ORT 1.30 requires it).
 */
export const SIMD_PROBE_BYTES = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, // magic + version
  1, 5, 1, 96, 0, 1, 123, // type section: () -> v128
  3, 2, 1, 0, // function section
  10, 22, 1, 20, 0, 253, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 11, // code: v128.const 0
])

/**
 * SPEC-GAP: the spec asks for "200k iterations" of xorshift targeting 40 ms, but 200k iterations take
 * under a millisecond on any current phone, so its 120 ms / 400 ms thresholds could never fire. We use
 * 8M iterations (about 17 ms on a 2024 laptop, so roughly 40 ms on a mid-range phone, which is the
 * reference the thresholds are written for), run in slices and stopped at 30 ms with linear
 * extrapolation so the benchmark itself never becomes a long task.
 */
export const BENCH_ITERATIONS = 8_000_000
export const BENCH_SLICE = 250_000
export const BENCH_CAP_MS = 30
export const BENCH_STANDARD_MS = 120
export const BENCH_BASIC_MS = 400

/** xorshift32 over `iterations` steps; returns a value so the loop cannot be optimised away. */
export function xorshiftLoop(seed: number, iterations: number): number {
  let x = seed | 0
  let acc = 0
  for (let i = 0; i < iterations; i++) {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    acc = (acc + (x & 0xff)) | 0
  }
  return acc ^ x
}

/** Pure, injectable-clock benchmark: time the fixed workload in slices, extrapolate if the cap is hit. */
export function measureBench(now: () => number, run: (iterations: number) => unknown = (n) => xorshiftLoop(2463534242, n)): number {
  const start = now()
  let done = 0
  while (done < BENCH_ITERATIONS) {
    run(BENCH_SLICE)
    done += BENCH_SLICE
    const elapsed = now() - start
    if (elapsed >= BENCH_CAP_MS && done < BENCH_ITERATIONS) {
      return Math.round(elapsed * (BENCH_ITERATIONS / done))
    }
  }
  return Math.round(now() - start)
}

/** Pure classification: the rules from spec 6.4, plus the plain-words reasons for every rule that fired. */
export function classifyTier(input: TierInputs): { tier: Tier; reasons: string[] } {
  const reasons: string[] = []
  let tier: Tier = 'full'

  if (!input.simd) reasons.push('no WASM SIMD')
  if (input.cores <= 2) reasons.push(`${input.cores} CPU core${input.cores === 1 ? '' : 's'}`)
  if (input.memGB <= 2) reasons.push(`${input.memGB} GB device memory`)
  if (input.benchMs > BENCH_STANDARD_MS) reasons.push(`CPU benchmark ${input.benchMs} ms (a mid-range phone takes about 40 ms)`)
  if (reasons.length > 0) tier = 'standard'

  const basicReasons: string[] = []
  if (!input.hasWorker) basicReasons.push('no Web Worker support')
  if (input.benchMs > BENCH_BASIC_MS) basicReasons.push(`CPU benchmark ${input.benchMs} ms, over the ${BENCH_BASIC_MS} ms limit`)
  if (input.saveData && !input.simd) basicReasons.push('data saver on and no WASM SIMD')
  if (basicReasons.length > 0) {
    tier = 'basic'
    reasons.push(...basicReasons)
  }

  // Not tier rules, but they decide whether a model may download by itself, so they belong in the explanation.
  if (input.saveData && !basicReasons.some((r) => r.startsWith('data saver'))) reasons.push('data saver on: models only load on a tap')
  if (input.slowNet) reasons.push('slow network: models only load on a tap')
  return { tier, reasons }
}

function describeFacts(input: TierInputs): string[] {
  return [
    `${input.cores} CPU core${input.cores === 1 ? '' : 's'}`,
    `${input.memGB} GB device memory${input.memGB === 4 ? ' (assumed; the browser does not report it)' : ''}`,
    input.simd ? 'WASM SIMD available' : 'no WASM SIMD',
    `CPU benchmark ${input.benchMs} ms`,
    input.hasWorker ? 'Web Workers available' : 'no Web Workers',
  ]
}

const SERVER_INPUTS: TierInputs = {
  simd: true,
  cores: 4,
  memGB: 4,
  saveData: false,
  slowNet: false,
  reduce: false,
  benchMs: 0,
  hasWorker: true,
}

/** What the prerender (and any code that runs before `detectTier`) sees. */
export const SERVER_TIER_INFO: TierInfo = Object.freeze({
  ...SERVER_INPUTS,
  tier: 'full',
  detected: 'full',
  override: null,
  reasons: [],
  facts: [],
})

function isTier(value: unknown): value is Tier {
  return value === 'full' || value === 'standard' || value === 'basic'
}

interface NetworkInformationLike {
  saveData?: boolean
  effectiveType?: string
}

function probeSimd(): boolean {
  try {
    return typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_PROBE_BYTES)
  } catch {
    return false
  }
}

let cached: TierInfo | null = null
const listeners = new Set<() => void>()

/**
 * Probe this device. Idempotent: later calls return the cached result. Browser only; on the server it
 * returns `SERVER_TIER_INFO`.
 */
export function detectTier(): TierInfo {
  if (cached) return cached
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return SERVER_TIER_INFO

  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const inputs: TierInputs = {
    simd: probeSimd(),
    cores: navigator.hardwareConcurrency ?? 2,
    memGB: memory ?? 4,
    saveData: connection?.saveData === true,
    slowNet: ['slow-2g', '2g', '3g'].includes(connection?.effectiveType ?? ''),
    reduce: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    benchMs: measureBench(() => performance.now()),
    hasWorker: 'Worker' in window,
  }
  const { tier: detected, reasons } = classifyTier(inputs)

  let override: Tier | null = null
  try {
    const stored = localStorage.getItem(TIER_STORAGE_KEY)
    if (isTier(stored)) override = stored
  } catch {
    /* storage blocked: no override */
  }
  const tier = override ?? detected
  if (override) reasons.unshift(`set to "${override}" manually in the Colophon (detected: ${detected})`)

  cached = { ...inputs, tier, detected, override, reasons, facts: describeFacts(inputs) }
  document.documentElement.dataset.tier = tier
  return cached
}

/** The tier in effect. `'full'` on the server and before `detectTier()` has run. */
export function getTier(): Tier {
  return cached?.tier ?? 'full'
}

export function getTierInfo(): TierInfo {
  return cached ?? SERVER_TIER_INFO
}

/**
 * May the 3.5 MB detector download without a tap? Only on the full tier, with data saver off and no
 * slow connection (spec 4.2). The 23 MB encoder and the 14 MB ORT runtime never auto-load: a tap only.
 */
export function canAutoLoadDetector(info: Pick<TierInfo, 'tier' | 'saveData' | 'slowNet'> = getTierInfo()): boolean {
  return info.tier === 'full' && !info.saveData && !info.slowNet
}

/** For `useSyncExternalStore` (see `useTierInfo` in store.ts). */
export function subscribeTier(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Persist a manual tier (or clear it with null). Takes effect on the next load; call `location.reload()`
 * after it, which is what the Colophon's tier control does.
 */
export function setTierOverride(tier: Tier | null): void {
  try {
    if (tier === null) localStorage.removeItem(TIER_STORAGE_KEY)
    else localStorage.setItem(TIER_STORAGE_KEY, tier)
  } catch {
    /* storage blocked: nothing to persist */
  }
  if (cached) {
    const next: TierInfo = { ...cached, override: tier }
    cached = next
    for (const listener of listeners) listener()
  }
}
