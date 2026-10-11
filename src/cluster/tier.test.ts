import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BENCH_BASIC_MS,
  BENCH_CAP_MS,
  BENCH_ITERATIONS,
  BENCH_SLICE,
  BENCH_STANDARD_MS,
  SIMD_PROBE_BYTES,
  canAutoLoadDetector,
  classifyTier,
  measureBench,
  type TierInputs,
} from './tier.ts'

const good: TierInputs = {
  simd: true,
  cores: 8,
  memGB: 8,
  saveData: false,
  slowNet: false,
  reduce: false,
  benchMs: 40,
  hasWorker: true,
}

test('the SIMD probe is a valid wasm module on engines with SIMD and invalid when truncated', () => {
  assert.equal(WebAssembly.validate(SIMD_PROBE_BYTES), true)
  assert.equal(WebAssembly.validate(SIMD_PROBE_BYTES.slice(0, SIMD_PROBE_BYTES.length - 1)), false)
})

test('a capable device is tier full with nothing to explain', () => {
  assert.deepEqual(classifyTier(good), { tier: 'full', reasons: [] })
})

test('each standard rule fires on its own and is reported in plain words', () => {
  assert.deepEqual(classifyTier({ ...good, simd: false }), { tier: 'standard', reasons: ['no WASM SIMD'] })
  assert.deepEqual(classifyTier({ ...good, cores: 2 }), { tier: 'standard', reasons: ['2 CPU cores'] })
  assert.deepEqual(classifyTier({ ...good, cores: 1 }).reasons, ['1 CPU core'])
  assert.deepEqual(classifyTier({ ...good, memGB: 2 }), { tier: 'standard', reasons: ['2 GB device memory'] })
  const slow = classifyTier({ ...good, benchMs: BENCH_STANDARD_MS + 1 })
  assert.equal(slow.tier, 'standard')
  assert.match(slow.reasons[0], /CPU benchmark 121 ms/)
  assert.equal(classifyTier({ ...good, benchMs: BENCH_STANDARD_MS }).tier, 'full', 'the threshold itself is still full')
})

test('basic needs no workers, a very slow CPU, or data saver without SIMD', () => {
  assert.equal(classifyTier({ ...good, hasWorker: false }).tier, 'basic')
  assert.ok(classifyTier({ ...good, hasWorker: false }).reasons.includes('no Web Worker support'))
  assert.equal(classifyTier({ ...good, benchMs: BENCH_BASIC_MS + 1 }).tier, 'basic')
  assert.equal(classifyTier({ ...good, saveData: true, simd: false }).tier, 'basic')
  // Data saver alone does not demote a capable device; it only blocks automatic model downloads.
  const saver = classifyTier({ ...good, saveData: true })
  assert.equal(saver.tier, 'full')
  assert.deepEqual(saver.reasons, ['data saver on: models only load on a tap'])
  assert.deepEqual(classifyTier({ ...good, slowNet: true }).reasons, ['slow network: models only load on a tap'])
})

test('reduced motion does not change the tier (it only switches motion to lite)', () => {
  assert.deepEqual(classifyTier({ ...good, reduce: true }), { tier: 'full', reasons: [] })
})

test('measureBench returns the full-run time on a fast device', () => {
  let t = 0
  const ms = measureBench(
    () => t,
    () => {
      t += 0.5 // each 250k slice takes 0.5 ms: 32 slices -> 16 ms
    },
  )
  assert.equal(ms, 16)
})

test('measureBench stops at the cap and extrapolates linearly on a slow device', () => {
  let t = 0
  let slices = 0
  const ms = measureBench(
    () => t,
    () => {
      slices += 1
      t += 20 // each slice takes 20 ms: the 30 ms cap is hit after 2 slices
    },
  )
  assert.equal(slices, Math.ceil(BENCH_CAP_MS / 20))
  assert.equal(ms, Math.round(40 * (BENCH_ITERATIONS / (2 * BENCH_SLICE))))
  assert.ok(ms > BENCH_BASIC_MS, 'a device this slow lands in tier basic')
})

test('a moderately slow device extrapolates into tier standard, not basic', () => {
  let t = 0
  const ms = measureBench(
    () => t,
    () => {
      t += 10
    },
  )
  assert.ok(ms > BENCH_STANDARD_MS && ms <= BENCH_BASIC_MS, `got ${ms} ms`)
})

test('the detector may auto-load only on the full tier with no data saver and no slow network', () => {
  assert.equal(canAutoLoadDetector({ tier: 'full', saveData: false, slowNet: false }), true)
  assert.equal(canAutoLoadDetector({ tier: 'standard', saveData: false, slowNet: false }), false)
  assert.equal(canAutoLoadDetector({ tier: 'basic', saveData: false, slowNet: false }), false)
  assert.equal(canAutoLoadDetector({ tier: 'full', saveData: true, slowNet: false }), false)
  assert.equal(canAutoLoadDetector({ tier: 'full', saveData: false, slowNet: true }), false)
})
