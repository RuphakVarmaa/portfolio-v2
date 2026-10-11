import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLeaderWatch, type LeaderEvent } from './leader-watch.ts'

const SELF = 'tab-self'

function harness() {
  let t = 100
  const watch = createLeaderWatch(() => t)
  return {
    tick: (ms: number) => {
      t += ms
    },
    see: (leaderId: string | null, term: number): LeaderEvent[] => watch.observe({ selfId: SELF, leaderId, term }),
  }
}

test('a lone tab electing itself, or learning who already leads, is not a loss', () => {
  const h = harness()
  assert.deepEqual(h.see(null, 0), [])
  assert.deepEqual(h.see(SELF, 1), [])
  const follower = harness()
  assert.deepEqual(follower.see(null, 0), [])
  assert.deepEqual(follower.see('tab-a', 1), [], 'discovering the leader is not a failover')
  assert.deepEqual(follower.see('tab-a', 1), [])
})

test('leader -> nobody -> this tab: one loss, then one election at a higher term', () => {
  const h = harness()
  h.see('tab-a', 1)
  h.tick(5)
  const lost = h.see(null, 1)
  assert.equal(lost.length, 1)
  assert.deepEqual(lost[0], { type: 'lost', lostId: 'tab-a', term: 1, at: 105 })
  assert.deepEqual(h.see(null, 1), [], 'still waiting for the election')
  h.tick(3)
  const elected = h.see(SELF, 2)
  assert.deepEqual(elected, [{ type: 'elected', leaderId: SELF, term: 2, lostId: 'tab-a', ms: 3, self: true }])
  assert.deepEqual(h.see(SELF, 2), [], 'and only once')
})

test('leader -> new leader in one step reports both events together', () => {
  const h = harness()
  h.see('tab-a', 1)
  const events = h.see('tab-b', 2)
  assert.deepEqual(
    events.map((e) => e.type),
    ['lost', 'elected'],
  )
  const elected = events[1]
  assert.ok(elected.type === 'elected')
  assert.equal(elected.leaderId, 'tab-b')
  assert.equal(elected.self, false)
  assert.equal(elected.term, 2)
})

test('the same leader coming back is not an election, and the loss can be reported again later', () => {
  const h = harness()
  h.see('tab-a', 1)
  assert.equal(h.see(null, 1).length, 1, 'tab-a went quiet')
  assert.deepEqual(h.see('tab-a', 1), [], 'tab-a woke up: no election happened')
  assert.equal(h.see(null, 1).length, 1, 'a second silence is a second loss')
})

test('an election needs a higher term than the one that was lost', () => {
  const h = harness()
  h.see('tab-a', 3)
  h.see(null, 3)
  assert.deepEqual(h.see('tab-b', 3), [], 'same term: not yet a new reign')
  assert.equal(h.see('tab-b', 4).length, 1)
})

test('this tab losing its own leadership (it stopped, or came back from the cache) is not "another tab was lost"', () => {
  const h = harness()
  h.see(SELF, 2)
  assert.deepEqual(h.see(null, 2), [])
  assert.deepEqual(h.see('tab-z', 3), [])
})
