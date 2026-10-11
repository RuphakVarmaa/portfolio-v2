import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ClusterSpan } from '../../cluster/scheduler.ts'
import { AXIS_H, GUTTER, LANE_H, PAD_R, kindOf, lanesFor, lastBurst, layoutSpans, niceStep } from './lane-layout.ts'

const span = (patch: Partial<ClusterSpan> & Pick<ClusterSpan, 'id' | 'node'>): ClusterSpan => ({
  kind: 'policy.fuzz',
  start: 0,
  attempts: 1,
  ...patch,
})

test('nice steps are 1, 2 or 5 times a power of ten', () => {
  assert.equal(niceStep(0.7), 1)
  assert.equal(niceStep(3.1), 5)
  assert.equal(niceStep(7), 10)
  assert.equal(niceStep(18), 20)
  assert.equal(niceStep(0.03), 0.05)
  assert.equal(niceStep(0), 1)
})

test('bar kinds say what happened to the attempt', () => {
  assert.equal(kindOf(span({ id: 'a', node: 'policy-a', outcome: 'ok' })), 'ok')
  assert.equal(kindOf(span({ id: 'a', node: 'policy-a', outcome: 'ok', attempts: 2 })), 'retry')
  assert.equal(kindOf(span({ id: 'a', node: 'policy-b', outcome: 'terminated' })), 'killed')
  assert.equal(kindOf(span({ id: 'a', node: 'policy-b', outcome: 'timeout' })), 'killed')
  assert.equal(kindOf(span({ id: 'a', node: 'policy-b', outcome: 'error' })), 'error')
  assert.equal(kindOf(span({ id: 'a', node: 'policy-b' })), 'open')
})

test('lanes follow the pool order and only include nodes that did something', () => {
  const spans = [span({ id: 'a', node: 'review-a' }), span({ id: 'b', node: 'policy-b' }), span({ id: 'c', node: 'policy-a' })]
  assert.deepEqual(lanesFor(spans), ['policy-a', 'policy-b', 'review-a'])
  assert.equal(lanesFor([], true).length, 5)
})

test('the layout puts the first span at the left edge of the plot and the last end at the right edge', () => {
  const spans = [
    span({ id: 'j1', node: 'policy-a', start: 100, end: 110, outcome: 'ok' }),
    span({ id: 'j2', node: 'policy-b', start: 100, end: 120, outcome: 'ok' }),
  ]
  const layout = layoutSpans(spans, { width: 500 })
  const plotRight = 500 - PAD_R
  assert.equal(layout.t0, 100)
  assert.equal(layout.range, 20)
  assert.equal(layout.bars[0].x, GUTTER)
  assert.equal(layout.bars[1].x + layout.bars[1].w, plotRight)
  assert.equal(layout.bars[0].lane, 0)
  assert.equal(layout.bars[1].lane, 1)
  assert.equal(layout.bars[1].y, AXIS_H + LANE_H + (LANE_H - 22) / 2)
  assert.ok(layout.ticks.length >= 3)
  assert.equal(layout.ticks[0].value, 0)
  assert.ok(layout.ticks.every((tick) => tick.x >= GUTTER && tick.x <= plotRight + 0.001))
})

test('a retried job gets a dimension from the end of the failed attempt to the end of the retry, with the scheduler\'s number', () => {
  const spans = [
    span({ id: 'j4', node: 'policy-b', start: 10, end: 14, outcome: 'terminated' }),
    span({ id: 'j4', node: 'policy-a', start: 20, end: 26, outcome: 'ok', attempts: 2, recoveredMs: 12 }),
    span({ id: 'j3', node: 'policy-a', start: 10, end: 20, outcome: 'ok' }),
  ]
  const layout = layoutSpans(spans, { width: 600 })
  assert.equal(layout.dims.length, 1)
  const dim = layout.dims[0]
  assert.equal(dim.ms, 12)
  assert.ok(dim.x2 > dim.x1)
  assert.equal(layout.lanes[dim.fromLane], 'policy-b')
  assert.equal(layout.lanes[dim.toLane], 'policy-a')
  assert.ok(layout.height > AXIS_H + 2 * LANE_H + 12, 'room is reserved under the lanes for the dimension line')
})

test('spans still in flight run to `until`; an empty trace lays out without throwing', () => {
  const open = layoutSpans([span({ id: 'a', node: 'policy-a', start: 5 })], { width: 400, until: 25 })
  assert.equal(open.bars[0].kind, 'open')
  assert.equal(open.bars[0].x + open.bars[0].w, 400 - PAD_R)
  const empty = layoutSpans([], { width: 400 })
  assert.deepEqual([empty.bars.length, empty.dims.length], [0, 0])
})

test('the last burst skips older activity separated by a long silence', () => {
  const spans = [
    span({ id: 'boot', node: 'retrieval-a', start: 100, end: 140, outcome: 'ok' }),
    span({ id: 'a', node: 'policy-a', start: 20_000, end: 20_005, outcome: 'ok' }),
    span({ id: 'b', node: 'policy-b', start: 20_002, end: 20_009, outcome: 'ok' }),
    span({ id: 'c', node: 'policy-a', start: 20_030, end: 20_036, outcome: 'ok' }),
  ]
  assert.deepEqual(lastBurst(spans).map((s) => s.id), ['a', 'b', 'c'])
  assert.deepEqual(lastBurst(spans, 30_000).map((s) => s.id), ['boot', 'a', 'b', 'c'])
  assert.deepEqual(lastBurst([]), [])
})
