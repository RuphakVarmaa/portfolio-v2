import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createConsumer } from './consumer.ts'
import { createRing } from './ring.ts'

/** A promise whose resolution the test controls. */
function gate() {
  let open!: () => void
  const promise = new Promise<void>((resolve) => {
    open = resolve
  })
  return { promise, open }
}

/** Let every promise continuation that is already runnable run. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

test('items are processed in order and never two at once', async () => {
  const ring = createRing<number>(8)
  const seen: number[] = []
  let active = 0
  let worst = 0
  const consumer = createConsumer({
    ring,
    process: async (n) => {
      active += 1
      worst = Math.max(worst, active)
      await settle()
      seen.push(n)
      active -= 1
    },
  })
  for (const n of [1, 2, 3, 4]) ring.push(n)
  consumer.wake()
  consumer.wake() // a second wake while running must not start a second loop
  for (let i = 0; i < 10; i++) await settle()
  assert.deepEqual(seen, [1, 2, 3, 4])
  assert.equal(worst, 1, 'one consumer, one item at a time')
  assert.equal(consumer.busy, false)
})

test('the consumer goes quiet when the ring is empty and wakes again on the next push', async () => {
  const ring = createRing<string>(4)
  const seen: string[] = []
  const consumer = createConsumer({ ring, process: async (item) => void seen.push(item) })
  ring.push('a')
  consumer.wake()
  await settle()
  assert.deepEqual(seen, ['a'])
  ring.push('b')
  consumer.wake()
  await settle()
  assert.deepEqual(seen, ['a', 'b'])
})

test('a slow consumer behind a fast producer: the ring keeps the newest items and counts the drops', async () => {
  const ring = createRing<number>(4)
  const seen: number[] = []
  const release = gate()
  const consumer = createConsumer({
    ring,
    process: async (n) => {
      if (n === 1) await release.promise // item 1 takes "a long time"
      seen.push(n)
    },
  })
  ring.push(1)
  consumer.wake() // takes item 1 at once; the ring is empty again
  await settle()
  assert.equal(consumer.busy, true)
  for (let n = 2; n <= 10; n++) {
    ring.push(n)
    consumer.wake()
  }
  assert.equal(ring.depth, 4)
  assert.equal(ring.dropped, 5, 'items 2..6 were evicted while the consumer was busy')
  release.open()
  for (let i = 0; i < 10; i++) await settle()
  assert.deepEqual(seen, [1, 7, 8, 9, 10], 'after the slow item the consumer catches up on the FRESHEST items')
})

test('the extra delay is applied after each item, read fresh each time, and skipped when zero', async () => {
  const ring = createRing<number>(8)
  const sleeps: number[] = []
  let delay = 0
  const consumer = createConsumer({
    ring,
    process: async () => undefined,
    delayMs: () => delay,
    sleep: async (ms) => void sleeps.push(ms),
  })
  ring.push(1)
  consumer.wake()
  await settle()
  assert.deepEqual(sleeps, [], 'no delay, no sleep')
  delay = 120
  ring.push(2)
  ring.push(3)
  consumer.wake()
  for (let i = 0; i < 5; i++) await settle()
  assert.deepEqual(sleeps, [120, 120])
})

test('a failing item is reported and the consumer carries on', async () => {
  const ring = createRing<number>(8)
  const seen: number[] = []
  const errors: Array<[unknown, number]> = []
  const consumer = createConsumer({
    ring,
    process: async (n) => {
      if (n === 2) throw new Error('worker went away')
      seen.push(n)
    },
    onError: (error, item) => errors.push([error, item]),
  })
  for (const n of [1, 2, 3]) ring.push(n)
  consumer.wake()
  for (let i = 0; i < 6; i++) await settle()
  assert.deepEqual(seen, [1, 3])
  assert.equal(errors.length, 1)
  assert.equal(errors[0][1], 2)
  assert.equal((errors[0][0] as Error).message, 'worker went away')
})

test('stop() lets the current item finish and takes nothing more; the rest stays in the ring', async () => {
  const ring = createRing<number>(8)
  const seen: number[] = []
  const release = gate()
  const consumer = createConsumer({
    ring,
    process: async (n) => {
      if (n === 1) await release.promise
      seen.push(n)
    },
  })
  for (const n of [1, 2, 3]) ring.push(n)
  consumer.wake()
  await settle()
  consumer.stop()
  release.open()
  for (let i = 0; i < 6; i++) await settle()
  assert.deepEqual(seen, [1])
  assert.deepEqual(ring.toArray(), [2, 3])
  ring.push(4)
  consumer.wake()
  await settle()
  assert.deepEqual(seen, [1], 'a stopped consumer stays stopped')
})

test('onSettled fires after every item, success or failure', async () => {
  const ring = createRing<number>(4)
  let settled = 0
  const consumer = createConsumer({
    ring,
    process: async (n) => {
      if (n === 2) throw new Error('x')
    },
    onError: () => undefined,
    onSettled: () => {
      settled += 1
    },
  })
  for (const n of [1, 2, 3]) ring.push(n)
  consumer.wake()
  for (let i = 0; i < 6; i++) await settle()
  assert.equal(settled, 3)
})
