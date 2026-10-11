import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCssTime, readStepMs, startReplay, type ReplayTimers } from './replay.ts'

/** A fake clock: timers fire in order when `advance` moves time past them. */
function fakeTimers() {
  let now = 0
  let next = 1
  const pending = new Map<number, { at: number; fn: () => void }>()
  const timers: ReplayTimers = {
    set(fn, ms) {
      const id = next++
      pending.set(id, { at: now + ms, fn })
      return id
    },
    clear(handle) {
      pending.delete(handle as number)
    },
  }
  const advance = (ms: number) => {
    const target = now + ms
    for (;;) {
      const due = [...pending.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      pending.delete(due[0])
      now = due[1].at
      due[1].fn()
    }
    now = target
  }
  return { timers, advance, pending: () => pending.size }
}

test('a replay reveals the first stage at once, then one more per step, and stops after the last', () => {
  const clock = fakeTimers()
  const seen: number[] = []
  startReplay(5, 240, (shown) => seen.push(shown), clock.timers)
  assert.deepEqual(seen, [1], 'the first stage is shown immediately')
  clock.advance(239)
  assert.deepEqual(seen, [1], 'not a moment early')
  clock.advance(1)
  assert.deepEqual(seen, [1, 2])
  clock.advance(240 * 3)
  assert.deepEqual(seen, [1, 2, 3, 4, 5])
  assert.equal(clock.pending(), 0, 'no timer is left running once every stage is shown')
  clock.advance(10_000)
  assert.deepEqual(seen, [1, 2, 3, 4, 5], 'nothing happens after the end')
})

test('a step of 0 (lite motion) reveals every stage at once and sets no timer', () => {
  const clock = fakeTimers()
  const seen: number[] = []
  startReplay(5, 0, (shown) => seen.push(shown), clock.timers)
  assert.deepEqual(seen, [5])
  assert.equal(clock.pending(), 0)
})

test('a negative or missing step behaves like 0', () => {
  const clock = fakeTimers()
  const seen: number[] = []
  startReplay(3, -1, (shown) => seen.push(shown), clock.timers)
  startReplay(3, Number.NaN, (shown) => seen.push(shown), clock.timers)
  assert.deepEqual(seen, [3, 3])
})

test('cancelling stops the replay where it is and clears the timer', () => {
  const clock = fakeTimers()
  const seen: number[] = []
  const cancel = startReplay(5, 100, (shown) => seen.push(shown), clock.timers)
  clock.advance(100)
  assert.deepEqual(seen, [1, 2])
  cancel()
  assert.equal(clock.pending(), 0)
  clock.advance(1000)
  assert.deepEqual(seen, [1, 2], 'no more steps after cancel')
  cancel()
})

test('nothing to replay: no step, no timer', () => {
  const clock = fakeTimers()
  const seen: number[] = []
  const cancel = startReplay(0, 240, (shown) => seen.push(shown), clock.timers)
  assert.deepEqual(seen, [])
  assert.equal(clock.pending(), 0)
  cancel()
})

test('a replay of one stage is shown at once and finishes', () => {
  const clock = fakeTimers()
  const seen: number[] = []
  startReplay(1, 240, (shown) => seen.push(shown), clock.timers)
  assert.deepEqual(seen, [1])
  assert.equal(clock.pending(), 0)
})

test('parseCssTime reads the motion tokens', () => {
  assert.equal(parseCssTime('240ms'), 240)
  assert.equal(parseCssTime(' 240ms'), 240)
  assert.equal(parseCssTime('0ms'), 0)
  assert.equal(parseCssTime('0.24s'), 240)
  assert.equal(parseCssTime('1s'), 1000)
  assert.equal(parseCssTime(''), 0)
  assert.equal(parseCssTime('auto'), 0)
  assert.equal(parseCssTime('12'), 0, 'a bare number is not a time')
})

test('readStepMs is 0 without a document (the server, and node)', () => {
  assert.equal(readStepMs(), 0)
})
