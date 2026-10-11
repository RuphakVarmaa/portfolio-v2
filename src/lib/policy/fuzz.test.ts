import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decide, type Decision } from './engine.ts'
import { STAGE_NAMES, batchSeed, makeCase, percentile, runBatch, xorshift32 } from './fuzz.ts'

const N = 1000

/** The sample lines start with a timestamp; everything after it is deterministic. */
const withoutTime = (line: string) => line.slice(line.indexOf(' tenant='))

test('xorshift32 is deterministic, never zero, and spreads over 32 bits', () => {
  const a = xorshift32(12345)
  const b = xorshift32(12345)
  const first = Array.from({ length: 6 }, () => a())
  assert.deepEqual(first, Array.from({ length: 6 }, () => b()))
  assert.ok(first.every((v) => Number.isInteger(v) && v > 0 && v <= 0xffffffff))
  assert.notDeepEqual(first, Array.from({ length: 6 }, xorshift32(12346)))
  // Pinned: the reference xorshift32 (13, 17, 5) from seed 1. If this moves, every fuzz run moves.
  assert.deepEqual(Array.from({ length: 3 }, xorshift32(1)), [270369, 67634689, 2647435461])
  // A zero seed must not lock the generator at zero.
  assert.ok(xorshift32(0)() > 0)
})

test('batch seeds differ per batch and per seed, and are stable', () => {
  assert.equal(batchSeed(7, 3), batchSeed(7, 3))
  assert.notEqual(batchSeed(7, 3), batchSeed(7, 4))
  assert.notEqual(batchSeed(7, 3), batchSeed(8, 3))
})

test('makeCase always draws seven numbers, whichever branch it takes', () => {
  for (let seed = 1; seed <= 50; seed++) {
    let draws = 0
    const next = xorshift32(seed)
    makeCase(() => {
      draws += 1
      return next()
    }, 0)
    assert.equal(draws, 7)
  }
})

test('a batch is deterministic: the same (seed, batch) reproduces every count and every sample line (so a retry is safe)', () => {
  const first = runBatch({ n: N, seed: 99, batch: 6 })
  const again = runBatch({ n: N, seed: 99, batch: 6 })
  const key = (r: typeof first) => ({
    evaluated: r.evaluated,
    leaks: r.leaks,
    crossTenant: r.crossTenant,
    allowed: r.allowed,
    denied: r.denied,
    auditBytes: r.auditBytes,
    sample: r.sample.map(withoutTime),
  })
  assert.deepEqual(key(first), key(again))
  const other = runBatch({ n: N, seed: 99, batch: 7 })
  assert.notDeepEqual(key(first), key(other), 'a different batch is a different set of requests')
})

test('ten batches of 1,000 evaluate 10,000 requests with 0 cross-tenant leaks, about half of them reaching across tenants', () => {
  let evaluated = 0
  let leaks = 0
  let cross = 0
  let allowed = 0
  let denied = 0
  for (let batch = 1; batch <= 10; batch++) {
    const r = runBatch({ n: N, seed: 5, batch })
    evaluated += r.evaluated
    leaks += r.leaks
    cross += r.crossTenant
    allowed += r.allowed
    denied += r.denied
  }
  assert.equal(evaluated, 10_000)
  assert.equal(leaks, 0, 'the engine never lets a request across tenants')
  assert.ok(cross > 4500 && cross < 5500, `about 50% cross-tenant, got ${cross}`)
  assert.equal(allowed + denied, 10_000)
  assert.ok(allowed > 0 && denied > cross - 1, 'some requests are allowed; every cross-tenant one is denied')
})

test('the leak counter really counts: with row-level checks switched off the same fuzz reports leaks', () => {
  // A broken engine: rule 0 is skipped (verify always passes). If the fuzz could not see this, "0 leaks" would mean nothing.
  const broken = runBatch({ n: N, seed: 5, batch: 1 }, { verify: () => true })
  assert.ok(broken.leaks > 0, `expected leaks from a broken engine, got ${broken.leaks}`)
  assert.ok(broken.leaks <= broken.crossTenant)
  assert.match(broken.sample[0], /tenant=([ABC]) .*:([ABC])-\d{3} → ALLOW /, 'the first sample line is the leak itself')
  // And a different break: the rule table says ALLOW to everyone.
  const allowAll: Decision = { allow: true, policy: 'broken.allow-all', stop: null }
  const alsoBroken = runBatch({ n: N, seed: 5, batch: 1 }, { verify: () => true, rules: () => allowAll })
  assert.equal(alsoBroken.leaks, alsoBroken.crossTenant, 'every cross-tenant request leaked')
  assert.equal(alsoBroken.allowed, N)
  // The healthy engine on the same requests: zero.
  assert.equal(runBatch({ n: N, seed: 5, batch: 1 }).leaks, 0)
})

test('the fuzz verdicts equal decide() request by request (the staged passes are the same engine)', () => {
  // Regenerate the very same requests and decide each one directly; the batch totals must agree.
  const next = xorshift32(batchSeed(21, 2))
  let allowed = 0
  let cross = 0
  for (let i = 0; i < N; i++) {
    const { request } = makeCase(next, i)
    if (request.actorTenant !== request.resourceTenant) cross += 1
    if (decide(request).allow) allowed += 1
  }
  const result = runBatch({ n: N, seed: 21, batch: 2 })
  assert.equal(result.allowed, allowed)
  assert.equal(result.denied, N - allowed)
  assert.equal(result.crossTenant, cross)
  assert.ok(result.allowed <= N - result.crossTenant, 'cross-tenant requests can never be among the allowed ones')
})

test('sample lines are real engine output: one cross-tenant refusal, one allow, one same-tenant refusal', () => {
  const r = runBatch({ n: N, seed: 3, batch: 1 })
  assert.equal(r.sample.length, 3)
  const [cross, allow, deny] = r.sample
  const parts = (line: string) => /tenant=([ABC]) .*resource=\w[\w-]*:([ABC])-\d{3} → (ALLOW|DENY) policy=(\S+)$/.exec(line)
  const c = parts(cross)
  assert.ok(c && c[1] !== c[2] && c[3] === 'DENY' && c[4] === 'rls.tenant', cross)
  const a = parts(allow)
  assert.ok(a && a[1] === a[2] && a[3] === 'ALLOW', allow)
  const d = parts(deny)
  assert.ok(d && d[1] === d[2] && d[3] === 'DENY' && d[4] !== 'rls.tenant', deny)
})

test('stages are named like the panel pipeline, in order, and the timings come from the injected clock', () => {
  // A clock that advances 1 ms per reading makes every pass's length equal to the number of readings inside it.
  let t = 0
  const r = runBatch({ n: 40, seed: 1, batch: 1 }, { clock: () => (t += 1), wall: () => 0 })
  assert.deepEqual(r.stages.map((s) => s.name), [...STAGE_NAMES])
  assert.deepEqual([...STAGE_NAMES], ['verify', 'evaluate', 'audit'])
  // verify: 1 reading to start it and 1 to start evaluate = 1 ms. evaluate: 10 slices x 2 readings, plus the audit start.
  assert.equal(r.stages[0].ms, 1)
  assert.equal(r.stages[1].ms, 21)
  assert.equal(r.stages[2].ms, 1)
  // Readings: 1 start, 2 verify, 3 evaluate, 4..23 ten slices, 24 audit, 25 finished.
  assert.equal(r.totalMs, 24, 'wall time from the first reading to the last')
  assert.equal(r.evaluated, 40)
})

test('percentile is nearest-rank', () => {
  assert.equal(percentile([], 95), 0)
  assert.equal(percentile([5], 95), 5)
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10)
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50), 5)
  assert.equal(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 95), 95)
  assert.equal(percentile([9, 1, 5], 100), 9, 'input order does not matter')
})

test('degenerate sizes do not throw', () => {
  for (const n of [0, -5, 0.4]) {
    const r = runBatch({ n, seed: 1, batch: 1 })
    assert.equal(r.evaluated, 0)
    assert.equal(r.leaks, 0)
    assert.deepEqual(r.sample, [])
  }
  assert.equal(runBatch({ n: 7.9, seed: 1, batch: 1 }).evaluated, 7)
})

test('10,000 evaluations finish well inside the acceptance budget (1.5 s on a 2020 laptop) and report evals/s', () => {
  const started = performance.now()
  let evaluated = 0
  for (let batch = 1; batch <= 10; batch++) evaluated += runBatch({ n: N, seed: 11, batch }).evaluated
  const ms = performance.now() - started
  assert.equal(evaluated, 10_000)
  assert.ok(ms < 1500, `took ${ms.toFixed(1)} ms`)
  assert.ok(evaluated / (ms / 1000) > 6_000, 'at least 6,000 evaluations per second even on a slow machine')
})
