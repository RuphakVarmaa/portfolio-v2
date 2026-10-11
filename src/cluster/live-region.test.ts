import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CLEAR_AFTER_MS, THROTTLE_MS, createAnnouncer } from './live-region.ts'

function rig() {
  let t = 1000
  const timers: Array<{ at: number; fn: () => void; id: number }> = []
  let seq = 0
  const announcer = createAnnouncer({
    now: () => t,
    setTimer: (fn, ms) => {
      const id = ++seq
      timers.push({ at: t + ms, fn, id })
      return id
    },
    clearTimer: (handle) => {
      const i = timers.findIndex((timer) => timer.id === handle)
      if (i >= 0) timers.splice(i, 1)
    },
  })
  const advance = (ms: number) => {
    const target = t + ms
    for (;;) {
      timers.sort((a, b) => a.at - b.at)
      const next = timers[0]
      if (!next || next.at > target) break
      timers.shift()
      t = Math.max(t, next.at)
      next.fn()
    }
    t = target
  }
  return { announcer, advance }
}

const text = (s: string) => s.split(String.fromCharCode(0xa0)).join('')

test('the first announcement is spoken immediately', () => {
  const { announcer } = rig()
  announcer.announce('Retrieval ready.')
  assert.equal(text(announcer.getSnapshot().polite), 'Retrieval ready.')
})

test('announcements inside the window are coalesced into one update at the end of the window', () => {
  const { announcer, advance } = rig()
  const seen: string[] = []
  announcer.subscribe(() => seen.push(text(announcer.getSnapshot().polite)))
  announcer.announce('Retrieval ready.')
  advance(100)
  announcer.announce('Policy ready.')
  advance(100)
  announcer.announce('Review ready.')
  assert.equal(text(announcer.getSnapshot().polite), 'Retrieval ready.', 'nothing new until the window closes')
  advance(THROTTLE_MS)
  assert.equal(text(announcer.getSnapshot().polite), 'Policy ready. Review ready.')
  assert.deepEqual(seen, ['Retrieval ready.', 'Policy ready. Review ready.'])
})

test('identical consecutive messages are de-duplicated, but a repeat later still changes the DOM text', () => {
  const { announcer, advance } = rig()
  announcer.announce('Email copied')
  const first = announcer.getSnapshot().polite
  advance(THROTTLE_MS + 1)
  announcer.announce('Email copied')
  advance(0)
  const second = announcer.getSnapshot().polite
  assert.equal(text(first), text(second))
  assert.notEqual(first, second, 'a trailing no-break space alternates so screen readers announce it again')

  const { announcer: b, advance: advanceB } = rig()
  b.announce('A')
  advanceB(10)
  b.announce('B')
  b.announce('B')
  advanceB(THROTTLE_MS)
  assert.equal(text(b.getSnapshot().polite), 'B')
})

test('polite and assertive are independent and empty text is ignored', () => {
  const { announcer } = rig()
  announcer.announce('   ')
  assert.equal(announcer.getSnapshot().polite, '')
  announcer.announce('Leader lost.', 'assertive')
  assert.equal(text(announcer.getSnapshot().assertive), 'Leader lost.')
  assert.equal(announcer.getSnapshot().polite, '')
})

test('the region empties itself after a quiet period', () => {
  const { announcer, advance } = rig()
  announcer.announce('Stamp earned.')
  advance(CLEAR_AFTER_MS + 1)
  assert.equal(announcer.getSnapshot().polite, '')
})
