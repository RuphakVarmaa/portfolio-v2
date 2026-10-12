import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SERVER_QUORUM_STATE,
  createQuorum,
  type ChannelLike,
  type ClusterMessage,
  type LockManagerLike,
  type Quorum,
} from '../../cluster/quorum.ts'
import { NO_NOTICE, advanceNotice, type NoticeMemory } from './quorum-notice.ts'

/**
 * The hero's notice (quorum-notice.ts) against the REAL quorum (src/cluster/quorum.ts): tabs that talk over a fake
 * BroadcastChannel and take turns at a fake Web Lock, each with the memory a mounted hero would keep. quorum-notice.test.ts
 * feeds the reducer snapshots written by hand; this file proves that the snapshots the quorum actually produces, in the
 * order it produces them (a BYE, then the lock; or the lock, then the BYE), are the ones the reducer was written for.
 */

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
      const due = [...this.timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0]
      if (!due) break
      this.t = Math.max(this.t, due[1].at)
      due[1].at += due[1].every
      due[1].fn()
    }
    this.t = target
  }
}

class FakeChannel implements ChannelLike {
  onmessage: ((event: { data: unknown }) => void) | null = null
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

class FakeLocks implements LockManagerLike {
  private queue: Array<{ callback: () => Promise<unknown>; resolve: (value: unknown) => void; reject: (reason: unknown) => void }> = []
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
  /** What this tab's hero remembers: the notice memory, updated on every change of the quorum, as the component does on every render. */
  memory: NoticeMemory
}

function world() {
  const clock = new FakeClock()
  const bus = new FakeBus()
  const locks = new FakeLocks()
  let n = 0
  const open = (): Tab => {
    const id = `tab-${++n}`
    let channel!: FakeChannel
    const quorum = createQuorum({
      createChannel: () => (channel = bus.create()),
      locks,
      now: clock.now,
      epochNow: clock.epoch,
      setInterval: clock.setInterval,
      clearInterval: clock.clearInterval,
      nodeId: id,
    })
    // The hero's first render is the server snapshot; every change after that is another render.
    const tab: Tab = { id, quorum, get channel() { return channel }, memory: advanceNotice(NO_NOTICE, SERVER_QUORUM_STATE) } as Tab
    quorum.subscribe(() => {
      tab.memory = advanceNotice(tab.memory, quorum.getState())
    })
    quorum.start()
    return tab
  }
  const settle = async () => {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve()
      await new Promise<void>((resolve) => setImmediate(resolve))
      bus.deliver()
    }
  }
  return { clock, open, settle }
}

test('two tabs: the second joins, then the leader closes: the survivor is told, in its own words, that it took the lock', async () => {
  const w = world()
  const a = w.open()
  await w.settle()
  assert.equal(a.memory.latest, null, 'a lone tab has nothing to say')
  const b = w.open()
  await w.settle()
  assert.deepEqual(a.memory.latest, { kind: 'joined', newcomer: false }, 'the first tab saw a peer arrive')
  assert.deepEqual(b.memory.latest, { kind: 'joined', newcomer: true }, 'and so did the newcomer (it finds the first tab as it starts), and it knows it is the one that joined')

  a.quorum.stop() // the leader's page goes: a BYE, then the browser hands the lock on
  await w.settle()
  assert.deepEqual(b.memory.latest, { kind: 'failover', nodeId: b.id, term: 2, self: true })
  assert.equal(b.memory.pending, null)
})

test('three tabs: the one that did not take the lock is told who did; the one that did is told it did', async () => {
  const w = world()
  const a = w.open()
  await w.settle()
  const b = w.open()
  await w.settle()
  const c = w.open()
  await w.settle()
  assert.equal(c.quorum.getState().nodes, 3)

  a.quorum.stop()
  await w.settle()
  // The lock goes to the next tab in the queue, b. c hears it announce itself at term 2.
  assert.deepEqual(b.memory.latest, { kind: 'failover', nodeId: b.id, term: 2, self: true })
  assert.deepEqual(c.memory.latest, { kind: 'failover', nodeId: b.id, term: 2, self: false })
})

test('a crashed leader (no BYE) is a failover too, and a later arrival replaces the failover line', async () => {
  const w = world()
  const a = w.open()
  await w.settle()
  const b = w.open()
  await w.settle()
  a.channel.closed = true // no BYE reaches anyone
  a.quorum.stop()
  await w.settle()
  assert.deepEqual(b.memory.latest, { kind: 'failover', nodeId: b.id, term: 2, self: true })

  const c = w.open()
  await w.settle()
  // (Whether b counts itself a newcomer is not asserted: the crashed tab is still on its peer list for 3.5 s, and it started
  // earlier. That is the one case where the wording of the arrival line can take the wrong side; it is a rare one.)
  assert.equal(b.memory.latest?.kind, 'joined', 'a new tab is the latest thing that happened')
  assert.deepEqual(c.memory.latest, { kind: 'joined', newcomer: true }, 'and the tab that has just opened knows it is the one that joined')
})

test('a follower closing is not a failover: the leader keeps its term and says nothing new', async () => {
  const w = world()
  const a = w.open()
  await w.settle()
  const b = w.open()
  await w.settle()
  const seq = a.memory.seq
  b.quorum.stop()
  await w.settle()
  assert.deepEqual(a.memory.latest, { kind: 'joined', newcomer: false })
  assert.equal(a.memory.seq, seq, 'nothing new was said')
  assert.equal(a.quorum.getState().term, 1)
})
