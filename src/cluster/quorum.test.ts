import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createQuorum,
  HEARTBEAT_MS,
  PEER_EXPIRY_MS,
  type ChannelLike,
  type ClusterMessage,
  type LockManagerLike,
  type Quorum,
  type QuorumState,
} from './quorum.ts'

/** Manual clock with repeating timers. */
class FakeClock {
  t = 0
  private seq = 0
  private timers = new Map<number, { at: number; every: number; fn: () => void }>()
  now = () => this.t
  epoch = () => 1_700_000_000_000 + this.t
  setInterval = (fn: () => void, ms: number): unknown => {
    const id = ++this.seq
    this.timers.set(id, { at: this.t + ms, every: ms, fn })
    return id
  }
  clearInterval = (handle: unknown) => {
    this.timers.delete(handle as number)
  }
  advance(ms: number) {
    const target = this.t + ms
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0]
      if (!due) break
      this.t = Math.max(this.t, due[1].at)
      due[1].at += due[1].every
      due[1].fn()
    }
    this.t = target
  }
}

/** One BroadcastChannel name shared by every tab; delivery is explicit so tests stay deterministic. */
class FakeBus {
  channels: FakeChannel[] = []
  private queue: Array<{ from: FakeChannel; data: ClusterMessage }> = []
  create(): FakeChannel {
    const channel = new FakeChannel(this)
    this.channels.push(channel)
    return channel
  }
  enqueue(from: FakeChannel, data: ClusterMessage) {
    this.queue.push({ from, data })
  }
  deliver() {
    while (this.queue.length > 0) {
      const { from, data } = this.queue.shift() as { from: FakeChannel; data: ClusterMessage }
      for (const channel of this.channels) {
        if (channel !== from && !channel.closed) channel.onmessage?.({ data: structuredClone(data) })
      }
    }
  }
}

class FakeChannel implements ChannelLike {
  onmessage: ((event: { data: unknown }) => void) | null = null
  /** A closed channel neither sends nor receives: used both for close() and for a crashed/suspended tab. */
  closed = false
  private bus: FakeBus
  constructor(bus: FakeBus) {
    this.bus = bus
  }
  postMessage(message: ClusterMessage) {
    if (!this.closed) this.bus.enqueue(this, message)
  }
  close() {
    this.closed = true
  }
}

/** navigator.locks: one origin-wide FIFO of exclusive requests. */
class FakeLocks implements LockManagerLike {
  private queue: Array<{
    callback: () => Promise<unknown>
    resolve: (value: unknown) => void
    reject: (reason: unknown) => void
  }> = []
  private held = false
  request(_name: string, options: { mode: 'exclusive'; signal?: AbortSignal }, callback: () => Promise<unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const entry = { callback, resolve, reject }
      options.signal?.addEventListener('abort', () => {
        if (!this.queue.includes(entry)) return
        this.queue = this.queue.filter((e) => e !== entry)
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
      this.queue.push(entry)
      this.pump()
    })
  }
  private pump() {
    if (this.held) return
    const entry = this.queue.shift()
    if (!entry) return
    this.held = true
    Promise.resolve(entry.callback()).then((value) => {
      this.held = false
      entry.resolve(value)
      this.pump()
    })
  }
}

interface Tab {
  id: string
  quorum: Quorum
  channel: FakeChannel
  alive: boolean
}

function world(options: { supported?: boolean } = {}) {
  const clock = new FakeClock()
  const bus = new FakeBus()
  const locks = new FakeLocks()
  const tabs: Tab[] = []
  let n = 0
  const open = (): Tab => {
    const id = `tab-${++n}`
    let channel!: FakeChannel
    const quorum = createQuorum({
      createChannel: () => (channel = bus.create()),
      locks: options.supported === false ? null : locks,
      now: clock.now,
      epochNow: clock.epoch,
      setInterval: clock.setInterval,
      clearInterval: clock.clearInterval,
      nodeId: id,
    })
    const tab: Tab = { id, quorum, get channel() { return channel }, alive: true } as Tab
    quorum.start()
    tabs.push(tab)
    return tab
  }
  /** Run lock grants and message delivery until nothing is left to do. */
  const settle = async () => {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve()
      await new Promise<void>((resolve) => setImmediate(resolve))
      bus.deliver()
    }
  }
  const close = (tab: Tab) => {
    tab.alive = false
    tab.quorum.stop()
  }
  /** The tab vanishes: no BYE reaches anyone and it stops hearing anything, but the browser still frees its lock. */
  const crash = (tab: Tab) => {
    tab.alive = false
    tab.channel.closed = true
    tab.quorum.stop()
  }
  /** Time passes; heartbeats flow. */
  const elapse = async (ms: number) => {
    for (let spent = 0; spent < ms; spent += HEARTBEAT_MS) {
      clock.advance(Math.min(HEARTBEAT_MS, ms - spent))
      await settle()
    }
  }
  return { clock, bus, locks, tabs, open, settle, close, crash, elapse }
}

const state = (tab: Tab): QuorumState => tab.quorum.getState()

test('a lone tab elects itself: term 1, one node', async () => {
  const w = world()
  const a = w.open()
  await w.settle()
  assert.deepEqual(
    { supported: state(a).supported, term: state(a).term, isLeader: state(a).isLeader, leaderId: state(a).leaderId, nodes: state(a).nodes },
    { supported: true, term: 1, isLeader: true, leaderId: a.id, nodes: 1 },
  )
  assert.deepEqual(state(a).members, [{ id: a.id, isSelf: true, isLeader: true, lastSeen: null }])
})

test('without Web Locks or BroadcastChannel the tab runs as a single node and says so', async () => {
  const w = world({ supported: false })
  const a = w.open()
  await w.settle()
  assert.equal(state(a).supported, false)
  assert.equal(state(a).isLeader, true)
  assert.equal(state(a).term, 1)
  assert.equal(state(a).nodes, 1)
  assert.equal(w.bus.channels.length, 0, 'no channel was opened')
})

test('a second tab joins: both see two nodes immediately, the first tab leads, terms agree', async () => {
  const w = world()
  const a = w.open()
  await w.settle()
  const b = w.open()
  await w.settle() // no clock advance: the HELLO exchange alone must converge
  assert.equal(state(a).nodes, 2)
  assert.equal(state(b).nodes, 2)
  assert.equal(state(a).leaderId, a.id)
  assert.equal(state(b).leaderId, a.id)
  assert.equal(state(b).isLeader, false)
  assert.equal(state(a).term, 1)
  assert.equal(state(b).term, 1)
  assert.deepEqual(state(b).members.map((m) => [m.id, m.isLeader, m.isSelf]), [
    [b.id, false, true],
    [a.id, true, false],
  ])
})

test('the tab that started second knows it is the newcomer; the one that was already open does not (review round 2)', async () => {
  const w = world()
  const a = w.open()
  await w.settle()
  assert.equal(state(a).newcomer, false, 'alone: nobody started before it')
  await w.elapse(5_000)
  const b = w.open()
  await w.settle()
  assert.equal(state(a).nodes, 2)
  assert.equal(state(a).newcomer, false, 'the tab that was open first is not the newcomer')
  assert.equal(state(b).newcomer, true, 'the tab that has just opened joined a quorum that existed')
  await w.elapse(5_000)
  const c = w.open()
  await w.settle()
  assert.deepEqual([a, b, c].map((tab) => state(tab).newcomer), [false, true, true], 'a third tab is a newcomer; the first never is')
  w.close(a)
  await w.settle()
  assert.equal(state(b).newcomer, false, 'with the older tab gone, nobody here started before b')
  assert.equal(state(c).newcomer, true)
})

test('two tabs that started in the same millisecond are not both newcomers (the tie goes by id)', async () => {
  const w = world()
  const a = w.open()
  const b = w.open()
  await w.settle() // no clock advance: both began at the same instant
  assert.deepEqual([state(a).newcomer, state(b).newcomer].sort(), [false, true])
})

test('closing the leader hands leadership to the survivor with a higher term', async () => {
  const w = world()
  const a = w.open()
  await w.settle()
  const b = w.open()
  await w.settle()
  w.close(a)
  await w.settle()
  assert.equal(state(b).isLeader, true)
  assert.equal(state(b).leaderId, b.id)
  assert.equal(state(b).term, 2, 'term = max(known) + 1')
  assert.equal(state(b).nodes, 1, 'BYE removed the old leader')
})

test('a crashed leader (no BYE) is replaced at once and expires from the peer list after 3.5 s', async () => {
  const w = world()
  const a = w.open()
  await w.settle()
  const b = w.open()
  await w.settle()
  const c = w.open()
  await w.settle()
  assert.equal(state(c).nodes, 3)

  w.crash(a)
  await w.settle()
  assert.equal(state(b).isLeader, true, 'the next tab in the lock queue won')
  assert.equal(state(b).term, 2)
  assert.equal(state(c).leaderId, b.id)
  assert.equal(state(c).term, 2)
  assert.equal(state(c).nodes, 3, 'the crashed tab is still listed until its heartbeat expires')

  await w.elapse(PEER_EXPIRY_MS + HEARTBEAT_MS)
  assert.equal(state(b).nodes, 2)
  assert.equal(state(c).nodes, 2)
  assert.ok(!state(c).peers.some((p) => p.id === a.id))
})

test('a suspended leader that still holds the lock expires from the peer list and followers report no leader', async () => {
  const w = world()
  const a = w.open()
  await w.settle()
  const b = w.open()
  await w.settle()
  a.channel.closed = true // frozen tab: heartbeats stop, the lock stays held
  await w.elapse(PEER_EXPIRY_MS + HEARTBEAT_MS)
  assert.equal(state(b).nodes, 1)
  assert.equal(state(b).leaderId, null)
  assert.equal(state(b).isLeader, false)
  assert.equal(state(b).term, 1, 'no election happened: the lock is still held')
})

test('heartbeat listeners fire once per heartbeat interval', async () => {
  const w = world()
  const a = w.open()
  let beats = 0
  a.quorum.onHeartbeat(() => {
    beats += 1
  })
  await w.elapse(3 * HEARTBEAT_MS)
  assert.equal(beats, 3)
})

test('subscribers are notified when the node count or term changes', async () => {
  const w = world()
  const a = w.open()
  await w.settle()
  const seen: number[] = []
  a.quorum.subscribe(() => seen.push(state(a).nodes))
  const b = w.open()
  await w.settle()
  assert.ok(seen.includes(2))
  w.close(b)
  await w.settle()
  assert.equal(seen.at(-1), 1)
})

/** Deterministic PRNG for the property test. */
function xorshift(seed: number) {
  let x = seed || 1
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return (x >>> 0) / 0x1_0000_0000
  }
}

test('property: across random joins, graceful closes and crashes the term never decreases and there is never more than one leader', async () => {
  for (const seed of [1, 7, 42, 1234, 99999]) {
    const random = xorshift(seed)
    const w = world()
    const lastTerm = new Map<string, number>()
    let highestLeaderTerm = 0
    let previousLeader: string | null = null

    const check = () => {
      const live = w.tabs.filter((t) => t.alive)
      if (live.length === 0) {
        // Every tab is gone: the cluster has no memory (nothing is persisted), so the next one starts at term 1.
        highestLeaderTerm = 0
        previousLeader = null
      }
      const leaders = live.filter((t) => state(t).isLeader)
      assert.ok(leaders.length <= 1, `seed ${seed}: more than one leader`)
      for (const tab of live) {
        const term = state(tab).term
        assert.ok(term >= (lastTerm.get(tab.id) ?? 0), `seed ${seed}: term went backwards in ${tab.id}`)
        lastTerm.set(tab.id, term)
      }
      const leader = leaders[0]
      if (leader) {
        const term = state(leader).term
        assert.ok(term >= highestLeaderTerm, `seed ${seed}: a leader has a lower term than a previous leader`)
        if (previousLeader !== null && previousLeader !== leader.id) {
          assert.ok(term > highestLeaderTerm, `seed ${seed}: a new leader must have a strictly higher term`)
        }
        highestLeaderTerm = term
        previousLeader = leader.id
      }
    }

    for (let step = 0; step < 80; step++) {
      const live = w.tabs.filter((t) => t.alive)
      const roll = random()
      if (live.length === 0 || (roll < 0.35 && live.length < 5)) w.open()
      else if (roll < 0.6) w.close(live[Math.floor(random() * live.length)])
      else if (roll < 0.75) w.crash(live[Math.floor(random() * live.length)])
      else await w.elapse(HEARTBEAT_MS * (1 + Math.floor(random() * 4)))
      await w.settle()
      check()
    }

    // Converge: after enough heartbeats every live tab agrees on the leader, the term and the node count.
    await w.elapse(PEER_EXPIRY_MS + 2 * HEARTBEAT_MS)
    check()
    const live = w.tabs.filter((t) => t.alive)
    if (live.length > 0) {
      const leader = live.find((t) => state(t).isLeader)
      assert.ok(leader, `seed ${seed}: with live tabs there must be a leader`)
      for (const tab of live) {
        assert.equal(state(tab).leaderId, leader.id, `seed ${seed}: ${tab.id} disagrees on the leader`)
        assert.equal(state(tab).term, state(leader).term, `seed ${seed}: ${tab.id} disagrees on the term`)
        assert.equal(state(tab).nodes, live.length, `seed ${seed}: ${tab.id} has the wrong node count`)
      }
    }
  }
})
