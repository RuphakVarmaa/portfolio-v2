import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copy } from '../../data/copy.ts'
import { NO_NOTICE, advanceNotice, noticeLines, type NoticeMemory, type NoticeText, type QuorumSight } from './quorum-notice.ts'

const sight = (nodeId: string, nodes: number, term: number, leaderId: string | null, newcomer = false): QuorumSight => ({ nodeId, nodes, term, leaderId, newcomer })

/** Feed a tab's successive quorum snapshots, as `useQuorum` would hand them over. */
function observe(...sights: QuorumSight[]): NoticeMemory {
  return sights.reduce(advanceNotice, NO_NOTICE)
}

const TEXT: NoticeText = {
  joined: (nodes) => `joined ${nodes}`,
  joinedNew: (nodes) => `i joined ${nodes}`,
  failover: ({ nodeId, term }) => `failover ${nodeId} ${term}`,
  self: (nodeId) => `${nodeId} (me)`,
  unsupported: 'unsupported',
  blocked: 'blocked',
}
const VIEW = (nodes: number, supported = true) => ({ supported, nodes })

// The server snapshot every client starts from (SERVER_QUORUM_STATE): no id, no term, no leader, one node.
const SERVER = sight('', 1, 0, null)

test('nothing is said about a lone tab: the first election and every heartbeat are not news', () => {
  const memory = observe(SERVER, sight('tab-a', 1, 0, null), sight('tab-a', 1, 1, 'tab-a'))
  assert.equal(memory.latest, null)
  assert.equal(memory.seq, 0)
  assert.deepEqual(noticeLines(memory, VIEW(1), false, TEXT), { live: '', still: '' })
})

test('a peer arriving is a "joined" event; it stays while the tabs do, and goes when they do', () => {
  const memory = observe(SERVER, sight('tab-a', 1, 1, 'tab-a'), sight('tab-a', 2, 1, 'tab-a'))
  assert.deepEqual(memory.latest, { kind: 'joined', newcomer: false })
  assert.deepEqual(noticeLines(memory, VIEW(2), false, TEXT), { live: 'joined 2', still: '' })
  // The peer leaves: the arrival line goes with it (as before this change), and no failover is invented.
  const after = advanceNotice(memory, sight('tab-a', 1, 1, 'tab-a'))
  assert.deepEqual(noticeLines(after, VIEW(1), false, TEXT), { live: '', still: '' })
})

test('a tab that opens next to a running one learns of its peer at once, and learning who already leads is not a failover', () => {
  const memory = observe(SERVER, sight('tab-b', 1, 0, null), sight('tab-b', 2, 1, 'tab-a', true))
  assert.deepEqual(memory.latest, { kind: 'joined', newcomer: true })
  // Even a first snapshot that already has two tabs counts as an arrival (a client-only render that skipped the server snapshot).
  assert.deepEqual(observe(sight('tab-b', 2, 1, 'tab-a', true)).latest, { kind: 'joined', newcomer: true })
})

test('the leader closes and this tab takes the lock (the BYE arrives first): one failover, in this tab', () => {
  const memory = observe(
    SERVER,
    sight('tab-b', 1, 0, null),
    sight('tab-b', 2, 1, 'tab-a'), // joined, tab-a leads at term 1
    sight('tab-b', 1, 1, null), // BYE: the leader is gone, nobody leads yet
    sight('tab-b', 1, 2, 'tab-b'), // the Web Lock is ours: term 2
  )
  assert.deepEqual(memory.latest, { kind: 'failover', nodeId: 'tab-b', term: 2, self: true })
  assert.equal(memory.seq, 2, 'one arrival, one failover')
  assert.equal(memory.pending, null)
})

test('the lock is handed over before the BYE arrives: still one failover, and the later BYE adds nothing', () => {
  const memory = observe(
    SERVER,
    sight('tab-b', 2, 1, 'tab-a'),
    sight('tab-b', 2, 2, 'tab-b'), // lock first: a different leader at a higher term
    sight('tab-b', 1, 2, 'tab-b'), // then the BYE
  )
  assert.deepEqual(memory.latest, { kind: 'failover', nodeId: 'tab-b', term: 2, self: true })
  assert.equal(memory.seq, 2)
})

test('a third tab that is not the new leader is told who took over', () => {
  const memory = observe(sight('tab-c', 3, 1, 'tab-a'), sight('tab-c', 3, 2, 'tab-b'), sight('tab-c', 2, 2, 'tab-b'))
  assert.deepEqual(memory.latest, { kind: 'failover', nodeId: 'tab-b', term: 2, self: false })
})

test('a leader that comes back is no failover, and a term that did not rise is no election', () => {
  // The leader goes quiet and returns (a suspended tab waking up).
  const back = observe(sight('tab-b', 2, 1, 'tab-a'), sight('tab-b', 1, 1, null), sight('tab-b', 2, 1, 'tab-a'))
  assert.deepEqual(back.latest, { kind: 'joined', newcomer: false }, 'only the arrival: nothing was lost for good')
  assert.equal(back.pending, null)
  // Someone else claims leadership at the same term: not an election this tab can call a takeover.
  const same = observe(sight('tab-b', 2, 1, 'tab-a'), sight('tab-b', 2, 1, 'tab-c'))
  assert.equal(same.latest?.kind, 'joined')
  assert.notEqual(same.pending, null, 'the loss is remembered until an election with a higher term is seen')
})

test('a failover is replaced by the next arrival, and the arrival line takes over from it', () => {
  const failed = observe(sight('tab-b', 2, 1, 'tab-a'), sight('tab-b', 1, 1, null), sight('tab-b', 1, 2, 'tab-b'))
  assert.equal(failed.latest?.kind, 'failover')
  const rejoined = advanceNotice(failed, sight('tab-b', 2, 2, 'tab-b'))
  assert.deepEqual(rejoined.latest, { kind: 'joined', newcomer: false })
  assert.equal(rejoined.seq, failed.seq + 1)
  assert.deepEqual(noticeLines(rejoined, VIEW(2), false, TEXT), { live: 'joined 2', still: '' })
})

test('advanceNotice returns the very same memory when the quorum did not change (a repeated render changes nothing)', () => {
  const a = sight('tab-a', 2, 1, 'tab-a')
  const memory = advanceNotice(NO_NOTICE, a)
  assert.equal(advanceNotice(memory, { ...a }), memory)
  assert.equal(advanceNotice(memory, a), memory)
  assert.notEqual(advanceNotice(memory, sight('tab-a', 3, 1, 'tab-a')), memory)
})

test('the tab that has just opened says it joined; the tab that was open says another one did (review round 2)', () => {
  const incumbent = observe(SERVER, sight('tab-a', 1, 1, 'tab-a'), sight('tab-a', 2, 1, 'tab-a', false))
  assert.deepEqual(noticeLines(incumbent, VIEW(2), false, TEXT), { live: 'joined 2', still: '' })
  const newcomer = observe(SERVER, sight('tab-b', 1, 0, null), sight('tab-b', 2, 1, 'tab-a', true))
  assert.deepEqual(noticeLines(newcomer, VIEW(2), false, TEXT), { live: 'i joined 2', still: '' })
  // The real sentences: the new tab never calls itself "that tab", and the old tab never says "this tab just joined".
  const real: NoticeText = { ...TEXT, joined: copy.controlRoom.quorumPrompt.joined, joinedNew: copy.controlRoom.quorumPrompt.joinedNew }
  assert.match(noticeLines(incumbent, VIEW(2), false, real).live, /^That tab just joined this one over BroadcastChannel\. NODES 2\./)
  assert.match(noticeLines(newcomer, VIEW(2), false, real).live, /^This tab just joined another one over BroadcastChannel\. NODES 2\./)
  // A newcomer flag that flips on its own (the older tab closed) is not a new event.
  assert.equal(advanceNotice(newcomer, sight('tab-b', 2, 1, 'tab-a', false)).latest, newcomer.latest)
})

test('the lines: a failover is shown and not announced, with the tab\'s own id marked; arrivals are announced; unsupported beats both', () => {
  const failed = observe(sight('tab-b', 2, 1, 'tab-a'), sight('tab-b', 1, 1, null), sight('tab-b', 1, 2, 'tab-b'))
  assert.deepEqual(noticeLines(failed, VIEW(1), false, TEXT), { live: '', still: 'failover tab-b (me) 2' })
  // The tab that did not take over is named plainly.
  const other = observe(sight('tab-c', 3, 1, 'tab-a'), sight('tab-c', 3, 2, 'tab-b'))
  assert.deepEqual(noticeLines(other, VIEW(3), false, TEXT), { live: '', still: 'failover tab-b 2' })
  // A blocked pop-up is said only when there is nothing newer to say.
  assert.deepEqual(noticeLines(NO_NOTICE, VIEW(1), true, TEXT), { live: 'blocked', still: '' })
  assert.deepEqual(noticeLines(failed, VIEW(1), true, TEXT), { live: '', still: 'failover tab-b (me) 2' })
  // No BroadcastChannel or Web Locks: this is a single node, and that is the whole story.
  assert.deepEqual(noticeLines(failed, VIEW(1, false), true, TEXT), { live: 'unsupported', still: '' })
})

test('the failover sentence is the spec 3.4 reward the Chaos Lab uses, with the live values', () => {
  const failed = observe(sight('tab-af76', 2, 1, 'tab-9c01'), sight('tab-af76', 1, 1, null), sight('tab-af76', 1, 2, 'tab-af76'))
  const text: NoticeText = { ...TEXT, failover: (took) => copy.chaos.experiments.leader.reward(took), self: copy.controlRoom.quorumPrompt.self }
  const { still } = noticeLines(failed, VIEW(1), false, text)
  assert.match(still, /^Leader lost\. tab-af76 \(this tab\) took the lock and became leader; term is now 2\./)
})
