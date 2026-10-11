import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPacer } from './pacer.ts'

/** Feed a camera of `fps` frames a second for `seconds`, return how many frames the pacer takes and when. */
function run(fps: number, capHz: number, seconds = 10, jitter: (i: number) => number = () => 0) {
  const pacer = createPacer(1000 / capHz)
  const taken: number[] = []
  const interval = 1000 / fps
  for (let i = 0; i < fps * seconds; i++) {
    const now = i * interval + jitter(i)
    if (pacer.ready(now)) taken.push(now)
  }
  return taken
}

test('a 30 fps camera under a 15 Hz cap gives 15 a second, every other frame', () => {
  const taken = run(30, 15)
  assert.ok(Math.abs(taken.length - 150) <= 1, `took ${taken.length}`)
})

test('a 20 fps camera under a 15 Hz cap gives 15 a second, not the 10 an interval check would', () => {
  const taken = run(20, 15)
  assert.ok(taken.length >= 148 && taken.length <= 151, `took ${taken.length}`)
})

test('a 24 fps camera under a 15 Hz cap gives 15 a second', () => {
  const taken = run(24, 15)
  assert.ok(taken.length >= 148 && taken.length <= 151, `took ${taken.length}`)
})

test('a 60 fps camera under a 10 Hz cap (the standard tier) gives 10 a second', () => {
  const taken = run(60, 10)
  assert.ok(taken.length >= 99 && taken.length <= 101, `took ${taken.length}`)
})

test('a camera slower than the cap delivers every frame it has (the cap is a maximum, not a target)', () => {
  const taken = run(12, 15)
  assert.equal(taken.length, 120)
})

test('the long-run rate never exceeds the cap, whatever the jitter', () => {
  const taken = run(30, 15, 20, (i) => ((i * 7919) % 11) - 5)
  const rate = taken.length / 20
  assert.ok(rate <= 15.1, `rate ${rate}`)
  assert.ok(rate >= 14, `rate ${rate}`)
})

test('after a stall the pacer does not burst: the next frame is taken, then the schedule resumes at the cap', () => {
  const pacer = createPacer(1000 / 15)
  assert.equal(pacer.ready(0), true)
  assert.equal(pacer.ready(33.3), false)
  assert.equal(pacer.ready(66.7), true)
  // The page was busy for two seconds.
  assert.equal(pacer.ready(2066.7), true)
  const burst = [2083.3, 2100, 2116.7].filter((t) => pacer.ready(t))
  assert.equal(burst.length, 0, 'no back-to-back captures right after a stall')
  assert.equal(pacer.ready(2133.4), true, 'the schedule resumes one period after the stalled frame')
})

test('reset makes the next frame due at once', () => {
  const pacer = createPacer(100)
  assert.equal(pacer.ready(0), true)
  assert.equal(pacer.ready(10), false)
  pacer.reset()
  assert.equal(pacer.ready(11), true)
})

test('a pacer needs a positive period', () => {
  assert.throws(() => createPacer(0), RangeError)
  assert.throws(() => createPacer(-5), RangeError)
  assert.throws(() => createPacer(Number.NaN), RangeError)
})
