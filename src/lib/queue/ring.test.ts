import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRing } from './ring.ts'

test('items come out in the order they went in while the ring has room', () => {
  const ring = createRing<number>(4)
  for (const n of [1, 2, 3]) ring.push(n)
  assert.equal(ring.depth, 3)
  assert.equal(ring.dropped, 0)
  assert.deepEqual([ring.shift(), ring.shift(), ring.shift()], [1, 2, 3])
  assert.equal(ring.shift(), undefined, 'an empty ring has nothing to give')
  assert.equal(ring.depth, 0)
})

test('drop-oldest: a full ring evicts its OLDEST item, never the new one', () => {
  const ring = createRing<number>(4)
  const evicted: Array<number | undefined> = []
  for (let n = 1; n <= 6; n++) evicted.push(ring.push(n))
  // Pushes 1..4 fit; push 5 evicts 1; push 6 evicts 2.
  assert.deepEqual(evicted, [undefined, undefined, undefined, undefined, 1, 2])
  assert.equal(ring.depth, 4, 'depth is capped at the capacity')
  assert.equal(ring.dropped, 2)
  assert.equal(ring.pushed, 6)
  assert.deepEqual(ring.toArray(), [3, 4, 5, 6], 'the newest four survive, in order')
  assert.equal(ring.peek(), 3)
  assert.deepEqual([ring.shift(), ring.shift(), ring.shift(), ring.shift()], [3, 4, 5, 6])
})

test('onDrop sees every evicted item, oldest first, exactly once (this is where a dropped frame is closed)', () => {
  const seen: string[] = []
  const ring = createRing<string>(2, { onDrop: (item) => seen.push(item) })
  for (const item of ['a', 'b', 'c', 'd', 'e']) ring.push(item)
  assert.deepEqual(seen, ['a', 'b', 'c'])
  assert.deepEqual(ring.toArray(), ['d', 'e'])
  ring.shift()
  assert.deepEqual(seen, ['a', 'b', 'c'], 'taking an item out with shift is not a drop')
})

test('a ring of one keeps only the newest item', () => {
  const ring = createRing<number>(1)
  assert.equal(ring.push(1), undefined)
  assert.equal(ring.push(2), 1)
  assert.equal(ring.push(3), 2)
  assert.equal(ring.depth, 1)
  assert.equal(ring.dropped, 2)
  assert.equal(ring.shift(), 3)
})

test('wrap-around keeps FIFO order over many interleaved pushes and shifts', () => {
  const ring = createRing<number>(4)
  const out: number[] = []
  let next = 0
  for (let round = 0; round < 1000; round++) {
    // Two in, one out: the buffer fills, overflows, and keeps wrapping.
    ring.push(next++)
    ring.push(next++)
    const item = ring.shift()
    if (item !== undefined) out.push(item)
    assert.ok(ring.depth <= 4, 'depth never exceeds the capacity')
  }
  for (let i = 1; i < out.length; i++) assert.ok(out[i] > out[i - 1], 'items always leave in the order they arrived')
  // Conservation: everything pushed was either taken out, dropped, or is still waiting.
  assert.equal(ring.pushed, out.length + ring.dropped + ring.depth)
})

test('backpressure under a fast producer: the consumer only ever sees fresh items and drops are counted', () => {
  // The producer makes 3 items per tick; the consumer takes 1. The buffer must stay bounded and the
  // consumer must always get something recent, never something that has waited longer than `capacity` ticks.
  const ring = createRing<{ id: number; tick: number }>(4)
  let id = 0
  let worstAge = 0
  let consumed = 0
  for (let tick = 0; tick < 200; tick++) {
    for (let k = 0; k < 3; k++) ring.push({ id: id++, tick })
    const item = ring.shift()
    if (item) {
      consumed += 1
      worstAge = Math.max(worstAge, tick - item.tick)
    }
    assert.ok(ring.depth <= ring.capacity)
  }
  assert.equal(consumed, 200)
  assert.ok(ring.dropped > 0, 'a producer faster than the consumer must cause drops')
  assert.ok(worstAge <= ring.capacity, `latency stays bounded by the capacity (worst age ${worstAge} ticks)`)
  assert.equal(ring.pushed, consumed + ring.dropped + ring.depth)
})

test('drain empties the ring oldest first and does not count as dropping', () => {
  const ring = createRing<number>(3)
  for (const n of [1, 2, 3, 4]) ring.push(n)
  assert.equal(ring.dropped, 1)
  assert.deepEqual(ring.drain(), [2, 3, 4])
  assert.equal(ring.depth, 0)
  assert.equal(ring.dropped, 1, 'draining hands the items to the caller; they are not drops')
  assert.deepEqual(ring.drain(), [])
  ring.push(9)
  assert.deepEqual(ring.toArray(), [9], 'the ring is fully usable after a drain')
})

test('toArray is a copy: changing it does not change the ring', () => {
  const ring = createRing<number>(3)
  ring.push(1)
  ring.toArray().push(99)
  assert.deepEqual(ring.toArray(), [1])
})

test('a bad capacity or an undefined item is refused', () => {
  assert.throws(() => createRing(0), RangeError)
  assert.throws(() => createRing(-1), RangeError)
  assert.throws(() => createRing(2.5), RangeError)
  assert.throws(() => createRing(Number.NaN), RangeError)
  const ring = createRing<number | undefined>(2)
  assert.throws(() => ring.push(undefined), TypeError)
})
