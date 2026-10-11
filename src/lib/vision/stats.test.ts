import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRateMeter, createWindow, percentile } from './stats.ts'

test('nearest-rank percentile: the 95th of 1..60 is 57, the 50th is 30, the 100th is the maximum', () => {
  const values = Array.from({ length: 60 }, (_, i) => i + 1)
  assert.equal(percentile(values, 95), 57)
  assert.equal(percentile(values, 50), 30)
  assert.equal(percentile(values, 100), 60)
  assert.equal(percentile(values, 0), 1, 'p0 is the minimum, not an out-of-range rank')
})

test('percentile does not depend on the order of the input and does not modify it', () => {
  const input = [9, 1, 5, 3, 7]
  assert.equal(percentile(input, 50), 5)
  assert.deepEqual(input, [9, 1, 5, 3, 7])
})

test('percentile of one value is that value; of nothing is null', () => {
  assert.equal(percentile([42], 95), 42)
  assert.equal(percentile([], 95), null)
})

test('the p95 of 60 samples ignores the slowest three and notices a fourth', () => {
  const fast = (n: number) => Array.from({ length: n }, () => 10)
  assert.equal(percentile([...fast(59), 500], 95), 10, 'one slow frame in 60 does not move the p95')
  assert.equal(percentile([...fast(57), 500, 500, 500], 95), 10, 'neither do three: that is 5% of 60')
  assert.equal(percentile([...fast(56), 500, 500, 500, 500], 95), 500, 'a fourth slow frame does')
})

test('a rolling window keeps only the most recent samples', () => {
  const window = createWindow(3)
  for (const v of [1, 2, 3, 4, 5]) window.push(v)
  assert.deepEqual(window.values(), [3, 4, 5])
  assert.equal(window.count, 3)
  assert.equal(window.percentile(100), 5)
  window.clear()
  assert.equal(window.count, 0)
  assert.equal(window.percentile(95), null)
})

test('a window of 60 forgets the 61st-oldest sample', () => {
  const window = createWindow(60)
  window.push(1000) // a cold-start outlier
  for (let i = 0; i < 60; i++) window.push(10)
  assert.equal(window.count, 60)
  assert.equal(window.percentile(100), 10, 'the outlier has aged out')
})

test('a bad window size is refused', () => {
  assert.throws(() => createWindow(0), RangeError)
  assert.throws(() => createWindow(1.5), RangeError)
})

test('the rate meter says nothing until it has two marks and half a second', () => {
  const meter = createRateMeter()
  assert.equal(meter.perSecond(0), null)
  meter.mark(0)
  assert.equal(meter.perSecond(100), null)
  meter.mark(100)
  assert.equal(meter.perSecond(200), null, 'under minSpanMs')
})

test('15 completions per second for 6 seconds reads 15, once the 3 s window has filled', () => {
  const meter = createRateMeter(3000)
  const interval = 1000 / 15
  let last = 0
  for (let t = 0; t <= 6000; t += interval) {
    meter.mark(t)
    last = t
  }
  const rate = meter.perSecond(last)
  assert.ok(rate !== null && Math.abs(rate - 15) < 0.4, `expected about 15, got ${String(rate)}`)
})

test('before the window fills, n marks over n-1 intervals are not over-reported', () => {
  const meter = createRateMeter(3000)
  for (let i = 0; i <= 10; i++) meter.mark(i * 100) // 10 per second for one second: 11 marks
  const rate = meter.perSecond(1000)
  assert.ok(rate !== null && Math.abs(rate - 10) < 1e-9, `expected 10, got ${String(rate)}`)
})

test('the rate falls to zero after the completions stop', () => {
  const meter = createRateMeter(3000)
  for (let i = 0; i < 60; i++) meter.mark(i * 50)
  assert.ok((meter.perSecond(3000) ?? 0) > 10)
  assert.equal(meter.perSecond(10_000), 0, 'nothing completed in the last 3 s')
})

test('clearing the meter starts a new measurement', () => {
  const meter = createRateMeter()
  meter.mark(0)
  meter.mark(600)
  meter.clear()
  assert.equal(meter.perSecond(1000), null)
})
