import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatMs } from '../../cluster/format.ts'
import { buildPipelineSteps, createBackpressure, megabytes, parseLimit, pickRange, tapLabelFor, twoDigits, type PipelineTimings } from './readings.ts'

const STEPS = [60, 120, 250, 500]

test('the dial range is the smallest step that holds the value with headroom', () => {
  assert.equal(pickRange(10, STEPS, 0), 60)
  assert.equal(pickRange(54, STEPS, 0), 60, '54 * 1.1 = 59.4 still fits')
  assert.equal(pickRange(55, STEPS, 0), 120, '55 * 1.1 = 60.5 does not')
  assert.equal(pickRange(200, STEPS, 0), 250)
  assert.equal(pickRange(9999, STEPS, 0), 500, 'beyond the last step the dial holds at the last step (the readout stays true)')
})

test('the range never shrinks: a value that falls back keeps the wider dial', () => {
  let range = 0
  for (const value of [10, 130, 70, 10]) range = pickRange(value, STEPS, range)
  assert.equal(range, 250)
})

test('backpressure engages at depth 3 and is held for 800 ms after the last deep reading', () => {
  const tracker = createBackpressure(3, 800)
  assert.equal(tracker.update(0, 0), false)
  assert.equal(tracker.update(2, 100), false, 'depth 2 of 4 is not backpressure')
  assert.equal(tracker.update(3, 200), true)
  assert.equal(tracker.update(0, 300), true, 'held')
  assert.equal(tracker.update(0, 999), true, '799 ms after the last deep reading')
  assert.equal(tracker.update(0, 1000), false, '800 ms: released')
  assert.equal(tracker.engaged, false)
})

test('a deeper reading while held restarts the hold, and reset() releases at once', () => {
  const tracker = createBackpressure(3, 800)
  tracker.update(4, 0)
  tracker.update(4, 700)
  assert.equal(tracker.update(0, 1400), true, 'held from the reading at 700')
  tracker.reset()
  assert.equal(tracker.engaged, false)
  assert.equal(tracker.update(0, 1401), false)
})

test('the production limit is read from the metric text', () => {
  assert.equal(parseLimit('<30ms'), 30)
  assert.equal(parseLimit('1.5 s'), 1.5)
  assert.equal(parseLimit('fast'), undefined)
  assert.equal(parseLimit(undefined), undefined)
})

test('confidence is shown as two digits, never three', () => {
  assert.equal(twoDigits(0.87), '87')
  assert.equal(twoDigits(0.05), '05')
  assert.equal(twoDigits(1), '99')
  assert.equal(twoDigits(0.999), '99')
  assert.equal(twoDigits(0), '00')
  assert.equal(twoDigits(-1), '00')
})

const timings = (overrides: Partial<PipelineTimings> = {}): PipelineTimings => ({
  captureMs: 1.24,
  queueMs: 0.06,
  detector: true,
  inferMs: 62.31,
  preMs: 3.8,
  postMs: 0.9,
  roundTripMs: 70,
  drawMs: 1.1,
  ...overrides,
})

test('with a detector the steps run capture, queue, worker, draw and use the stage names the panel knows', () => {
  const steps = buildPipelineSteps(timings(), formatMs)
  assert.deepEqual(steps.map((s) => s.node), ['camera', 'queue', 'yolo', 'react'])
  assert.deepEqual(steps.flatMap((s) => s.stages.map((stage) => stage.name)), ['capture', 'queue', 'infer', 'letterbox + decode', 'transfer', 'draw'])
  const byName = Object.fromEntries(steps.flatMap((s) => s.stages).map((stage) => [stage.name, stage.ms]))
  assert.equal(byName.capture, 1.2)
  assert.equal(byName.infer, 62.3)
  assert.equal(byName['letterbox + decode'], 4.7)
  assert.equal(byName.transfer, 3, '70 ms round trip minus 67 ms of the worker\'s own measured work')
  assert.deepEqual(steps.map((s) => s.annotation), ['1.2 ms', '0.1 ms', '62 ms', '1.1 ms'])
})

test('without a detector there is no infer stage (the panel shows a dash) and nothing is annotated under YOLOv8', () => {
  const steps = buildPipelineSteps(timings({ detector: false, inferMs: 0, postMs: 0, roundTripMs: 6 }), formatMs)
  const names = steps.flatMap((s) => s.stages.map((stage) => stage.name))
  assert.ok(!names.includes('infer'))
  assert.ok(names.includes('letterbox'))
  assert.equal(steps[2].annotation, undefined)
})

test('transfer is the round trip beyond the worker\'s own measured work, and never negative', () => {
  const clock = buildPipelineSteps(timings({ roundTripMs: 10 }), formatMs) // worker reported more than the round trip
  const transfer = clock.flatMap((s) => s.stages).find((stage) => stage.name === 'transfer')
  assert.equal(transfer?.ms, 0)
})

const TEMPLATE = 'Load the detector — 3.5 MB model + 14 MB runtime, once, cached'

test('megabytes: one decimal under 10 MB, whole numbers from 10 MB up', () => {
  assert.equal(megabytes(3_500_000), '3.5 MB')
  assert.equal(megabytes(3_456_789), '3.5 MB')
  assert.equal(megabytes(5_949_999), '5.9 MB')
  assert.equal(megabytes(705_884), '0.7 MB')
  assert.equal(megabytes(14_239_897), '14 MB')
  assert.equal(megabytes(9_999_999), '10 MB')
})

test('the tap label keeps the copy\'s words and takes the real sizes of the files', () => {
  assert.equal(tapLabelFor(TEMPLATE, 3_500_000, 14_239_897), TEMPLATE, 'the spec sizes come out unchanged')
  assert.equal(tapLabelFor(TEMPLATE, 5_432_100, 14_239_897), 'Load the detector — 5.4 MB model + 14 MB runtime, once, cached')
  assert.equal(tapLabelFor(TEMPLATE, 3_500_000, 12_000_000), 'Load the detector — 3.5 MB model + 12 MB runtime, once, cached')
})

test('unknown sizes leave the copy as it is', () => {
  assert.equal(tapLabelFor(TEMPLATE, null, null), TEMPLATE)
  assert.equal(tapLabelFor(TEMPLATE, undefined, 0), TEMPLATE)
  assert.equal(tapLabelFor('No sizes in this sentence', 1_000_000, 2_000_000), 'No sizes in this sentence')
})
