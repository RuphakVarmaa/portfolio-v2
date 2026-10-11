import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatDuration, timeRepeated } from './timing.ts'

test('formatDuration: milliseconds keep their resolution down to a tenth, then microseconds take over', () => {
  assert.equal(formatDuration(412.4), '412 ms')
  assert.equal(formatDuration(10), '10 ms')
  assert.equal(formatDuration(9.96), '10 ms')
  assert.equal(formatDuration(3.44), '3.4 ms')
  assert.equal(formatDuration(1), '1 ms')
  assert.equal(formatDuration(0.42), '0.42 ms')
  assert.equal(formatDuration(0.1), '0.1 ms')
  assert.equal(formatDuration(0.0996), '100 µs')
  assert.equal(formatDuration(0.046), '46 µs')
  assert.equal(formatDuration(0.01), '10 µs')
  assert.equal(formatDuration(0.0004), '0.4 µs')
  assert.equal(formatDuration(0.0001), '0.1 µs')
})

test('formatDuration: only a stage that measured exactly nothing prints 0 ms; something that ran never does', () => {
  assert.equal(formatDuration(0), '0 ms')
  assert.equal(formatDuration(-1), '0 ms')
  assert.equal(formatDuration(Number.NaN), '0 ms')
  assert.equal(formatDuration(0.00001), '0.1 µs', 'a floor, so work that took time is never shown as nothing')
})

test('timeRepeated keeps a tenth of a microsecond (four decimals) so fast stages are not rounded to zero', () => {
  // The fake clock moves 0.0004 ms per read, and the function costs nothing: a mean of about 0.0004 ms must survive.
  let t = 0
  const result = timeRepeated(() => 1, { clock: () => (t += 0.0004), minMs: 0.0004, maxRuns: 1 })
  assert.equal(result.runs, 1)
  assert.equal(result.ms, 0.0004)
})
