import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EMPTY_RACK, axisDeflections, layoutRack, recentlyLost, sameCards, type RackCard, type RackState } from './rack.ts'

const frame = (id: number): RackCard => ({ id, kind: 'frame', n: id, raw: null, width: 320, height: 240, axes: null })
const sample = (id: number): RackCard => ({ id, kind: 'motion', n: id, raw: null, width: 0, height: 0, axes: [1, 2, 3] })
const state = (parts: Partial<RackState>): RackState => ({ ...EMPTY_RACK, ...parts })

test('an empty rack places nothing', () => {
  assert.deepEqual(layoutRack(EMPTY_RACK, 4), [])
})

test('queued cards fill from the head: the oldest is in the last slot, the newest next to it', () => {
  const placed = layoutRack(state({ queued: [frame(1), frame(2), frame(3)] }), 4)
  assert.deepEqual(
    placed.map((p) => [p.card.id, p.slot, p.ghost]),
    [
      [1, 3, false],
      [2, 2, false],
      [3, 1, false],
    ],
  )
})

test('a full rack uses every slot, slot 0 holding the newest', () => {
  const placed = layoutRack(state({ queued: [frame(1), frame(2), frame(3), frame(4)] }), 4)
  assert.deepEqual(placed.map((p) => p.slot).sort(), [0, 1, 2, 3])
  assert.equal(placed.find((p) => p.card.id === 4)?.slot, 0)
  assert.equal(placed.find((p) => p.card.id === 1)?.slot, 3)
})

test('a list longer than the rack shows only the newest cards it can hold', () => {
  const placed = layoutRack(state({ queued: [1, 2, 3, 4, 5, 6].map(frame) }), 4)
  assert.deepEqual(placed.map((p) => p.card.id).sort(), [3, 4, 5, 6])
})

test('the worker holds its card in the bay, after the last slot', () => {
  const placed = layoutRack(state({ working: frame(9), busy: true, queued: [frame(10)] }), 4)
  assert.equal(placed.find((p) => p.card.id === 9)?.slot, 4)
  assert.equal(placed.find((p) => p.card.id === 10)?.slot, 3)
})

test('a card the worker has taken is drawn once, in the bay, even if the snapshot still lists it as queued', () => {
  const placed = layoutRack(state({ working: frame(2), queued: [frame(2), frame(3)] }), 4)
  assert.equal(placed.filter((p) => p.card.id === 2).length, 1)
  assert.equal(placed.find((p) => p.card.id === 2)?.slot, 4)
  assert.equal(placed.find((p) => p.card.id === 3)?.slot, 3)
})

test('evicted cards are ghosts at the head slot and never also appear as queued', () => {
  const placed = layoutRack(state({ lost: [frame(1)], queued: [frame(1), frame(2)] }), 4)
  const one = placed.filter((p) => p.card.id === 1)
  assert.equal(one.length, 1)
  assert.deepEqual([one[0].slot, one[0].ghost], [3, true])
  assert.equal(placed.find((p) => p.card.id === 2)?.slot, 3, 'the live cards still use the slots')
})

test('frames and motion samples share the same slots', () => {
  const placed = layoutRack(state({ queued: [frame(1), sample(2), sample(3)] }), 4)
  assert.deepEqual(placed.map((p) => p.card.kind), ['frame', 'motion', 'motion'])
})

test('sameCards compares ids and order', () => {
  assert.equal(sameCards([frame(1), frame(2)], [frame(1), frame(2)]), true)
  assert.equal(sameCards([frame(1), frame(2)], [frame(2), frame(1)]), false)
  assert.equal(sameCards([frame(1)], [frame(1), frame(2)]), false)
  assert.equal(sameCards([], []), true)
})

test('recentlyLost keeps what is younger than the cutoff, newest last, capped', () => {
  const lost = [1, 2, 3, 4, 5].map((id) => ({ card: frame(id), at: id * 100 }))
  assert.deepEqual(
    recentlyLost(lost, 600, 250, 8).map((e) => e.card.id),
    [4, 5],
    'only the ones evicted within the last 250 ms',
  )
  assert.deepEqual(
    recentlyLost(lost, 500, 10_000, 2).map((e) => e.card.id),
    [4, 5],
    'at most two, the newest',
  )
  assert.deepEqual(recentlyLost([], 0, 100, 4), [])
})

test('axis deflections are scaled to a hard shake and clamped to the bar', () => {
  assert.deepEqual(axisDeflections([0, 10, -10]), [0, 0.5, -0.5])
  assert.deepEqual(axisDeflections([40, -40, 20]), [1, -1, 1])
  assert.deepEqual(axisDeflections([5, 5, 5], 10), [0.5, 0.5, 0.5])
})
