import assert from 'node:assert/strict'
import { test } from 'node:test'
import { durationFormatter, formatCell, formatDuration, timeRepeated } from './timing.ts'

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

test('formatCell: a ledger cell keeps one decimal under 10 and none from 10, so "4" never sits next to "4.7"', () => {
  assert.equal(formatCell(4), '4.0')
  assert.equal(formatCell(4.7), '4.7')
  assert.equal(formatCell(4.117), '4.1')
  assert.equal(formatCell(2.04), '2.0')
  assert.equal(formatCell(0.8), '0.8')
  assert.equal(formatCell(9.94), '9.9')
  assert.equal(formatCell(9.96), '10', 'rounds up across the boundary, then follows the rule for 10 and over')
  assert.equal(formatCell(10), '10')
  assert.equal(formatCell(12.4), '12')
  assert.equal(formatCell(0), '0.0')
  assert.equal(formatCell(Number.NaN), '0.0')
  // Every cell of a typical row has the same shape: one digit, a point, one digit (or two whole digits from 10).
  for (const ms of [4, 4.7, 2.6, 3, 4.2, 2.8, 3.1, 5, 6.35, 7.9]) assert.match(formatCell(ms), /^\d\.\d$/)
})

test('durationFormatter: stages that sit side by side share one unit and one precision rule', () => {
  // A seeded review: about a millisecond down to a couple of microseconds. All in microseconds.
  const review = [1.52, 0.27, 0.17, 0.0033, 0.0016]
  assert.deepEqual(review.map(durationFormatter(review)), ['1520 µs', '270 µs', '170 µs', '3.3 µs', '1.6 µs'])
  // "0.5 ms" beside "54 µs" is the pair this exists to prevent; a trailing zero is kept (2.0, not 2).
  const mixed = [0.5, 0.054, 0.002, 0.0004]
  assert.deepEqual(mixed.map(durationFormatter(mixed)), ['500 µs', '54 µs', '2.0 µs', '0.4 µs'])
  // The policy fuzz's stages: nothing under 0.1 ms, so milliseconds, with the same two figures.
  const fuzz = [28.1, 0.6, 0.4]
  assert.deepEqual(fuzz.map(durationFormatter(fuzz)), ['28 ms', '0.60 ms', '0.40 ms'])
  // A long paste: the largest stage is 10 ms or more, so microseconds would not fit a card; two decimals at most, so the small ones stay short.
  const paste = [21.7, 4.3, 5.1, 0.03, 0.021]
  assert.deepEqual(paste.map(durationFormatter(paste)), ['22 ms', '4.3 ms', '5.1 ms', '0.03 ms', '0.02 ms'])
})

test('durationFormatter: boundaries round into the right shape, and a time never prints as nothing', () => {
  const ms = durationFormatter([9.96, 1])
  assert.equal(ms(9.96), '10 ms', 'not 10.0')
  assert.equal(ms(1), '1.0 ms')
  assert.equal(ms(0.996), '1.0 ms', 'rounds up across 1 ms, then reads as 1.0')
  const us = durationFormatter([0.0099, 0.9996])
  assert.equal(us(0.0099), '9.9 µs')
  assert.equal(us(0.00996), '10 µs', 'not 10.0')
  assert.equal(us(0.9996), '1000 µs', 'still microseconds, and not grouped: the unit is the set\'s, not the value\'s')
  assert.equal(us(0.00001), '0.1 µs', 'a floor, so work that took time is never shown as nothing')
  const long = durationFormatter([12, 0.001])
  assert.equal(long(0.0001), '<0.01 ms', 'under 5 microseconds the second decimal would read 0.00')
  assert.equal(long(0.005), '0.01 ms')
  // Zero is a stage that did not run: it prints as nothing in the set's unit and does not pick the unit.
  const withSkipped = durationFormatter([0, 0.17, 0.0016])
  assert.equal(withSkipped(0), '0 µs')
  assert.equal(withSkipped(0.17), '170 µs')
  // No measurements at all: a lone time falls back to the sentence format.
  assert.equal(durationFormatter([])(0.42), '0.42 ms')
  assert.equal(durationFormatter([0, Number.NaN])(46 / 1000), '46 µs')
})

test('timeRepeated keeps a tenth of a microsecond (four decimals) so fast stages are not rounded to zero', () => {
  // The fake clock moves 0.0004 ms per read, and the function costs nothing: a mean of about 0.0004 ms must survive.
  let t = 0
  const result = timeRepeated(() => 1, { clock: () => (t += 0.0004), minMs: 0.0004, maxRuns: 1 })
  assert.equal(result.runs, 1)
  assert.equal(result.ms, 0.0004)
})
