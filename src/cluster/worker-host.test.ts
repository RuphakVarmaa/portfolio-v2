import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createWorker, HANDSHAKE_TIMEOUT_MS, PING_INTERVAL_MS, type DeadReason, type RawWorkerLike } from './worker-host.ts'
import type { FromWorker, ToWorker } from './protocol.ts'

class FakeRaw implements RawWorkerLike {
  posted: unknown[] = []
  terminated = 0
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: ((event: { message?: string; preventDefault?: () => void }) => void) | null = null
  onmessageerror: ((event: unknown) => void) | null = null
  postMessage(message: unknown) {
    this.posted.push(message)
  }
  terminate() {
    this.terminated += 1
  }
  emit(msg: FromWorker) {
    this.onmessage?.({ data: msg })
  }
}

function rig(options: { board?: { visible: boolean }; throwOnCreate?: boolean } = {}) {
  let t = 0
  let seq = 0
  const timeouts = new Map<number, { at: number; fn: () => void }>()
  const intervals = new Map<number, { at: number; every: number; fn: () => void }>()
  const raw = new FakeRaw()
  const received: FromWorker[] = []
  const deaths: Array<{ reason: DeadReason; detail?: string }> = []
  const host = createWorker(
    'policy',
    1,
    { message: (m) => received.push(m), dead: (reason, detail) => deaths.push({ reason, detail }) },
    {
      createRaw: () => {
        if (options.throwOnCreate) throw new Error('blocked by CSP')
        return raw
      },
      now: () => t,
      isBoardVisible: () => options.board?.visible ?? false,
      setTimer: (fn, ms) => {
        const id = ++seq
        timeouts.set(id, { at: t + ms, fn })
        return id
      },
      clearTimer: (h) => void timeouts.delete(h as number),
      setIntervalTimer: (fn, ms) => {
        const id = ++seq
        intervals.set(id, { at: t + ms, every: ms, fn })
        return id
      },
      clearIntervalTimer: (h) => void intervals.delete(h as number),
    },
  )
  const advance = (ms: number) => {
    const target = t + ms
    for (;;) {
      const all = [
        ...[...timeouts.entries()].map(([id, x]) => ({ id, at: x.at, kind: 'timeout' as const })),
        ...[...intervals.entries()].map(([id, x]) => ({ id, at: x.at, kind: 'interval' as const })),
      ].filter((x) => x.at <= target)
      all.sort((a, b) => a.at - b.at || a.id - b.id)
      const next = all[0]
      if (!next) break
      t = Math.max(t, next.at)
      if (next.kind === 'timeout') {
        const entry = timeouts.get(next.id)
        timeouts.delete(next.id)
        entry?.fn()
      } else {
        const entry = intervals.get(next.id)
        if (entry) {
          entry.at += entry.every
          entry.fn()
        }
      }
    }
    t = target
  }
  return { host, raw, received, deaths, advance }
}

test('the host names its node after the service and pool index', () => {
  assert.equal(rig().host.node, 'policy-b')
})

test('messages pass through, including ready', () => {
  const { raw, received } = rig()
  raw.emit({ type: 'ready', node: 'policy-b', at: 1 })
  raw.emit({ type: 'log', level: 'info', text: 'hello' })
  assert.deepEqual(received.map((m) => m.type), ['ready', 'log'])
})

test('a worker that never says ready is terminated and reported dead after 10 s', () => {
  const { raw, deaths, advance } = rig()
  advance(HANDSHAKE_TIMEOUT_MS - 1)
  assert.equal(deaths.length, 0)
  advance(1)
  assert.deepEqual(deaths.map((d) => d.reason), ['handshake-timeout'])
  assert.equal(raw.terminated, 1)
})

test('ready within the window cancels the handshake timer', () => {
  const { raw, deaths, advance } = rig()
  advance(500)
  raw.emit({ type: 'ready', node: 'policy-b', at: 1 })
  advance(HANDSHAKE_TIMEOUT_MS * 2)
  assert.equal(deaths.length, 0)
  assert.equal(raw.terminated, 0)
})

test('pings go out every 5 s only while the board is visible, and only after ready', () => {
  const board = { visible: false }
  const { raw, advance } = rig({ board })
  advance(PING_INTERVAL_MS) // still inside the 10 s handshake window
  assert.deepEqual(raw.posted, [], 'no pings before ready')
  raw.emit({ type: 'ready', node: 'policy-b', at: 1 })
  advance(PING_INTERVAL_MS)
  assert.deepEqual(raw.posted, [], 'board hidden: no ping')
  board.visible = true
  advance(PING_INTERVAL_MS)
  assert.equal(raw.posted.length, 1)
  assert.equal((raw.posted[0] as ToWorker).type, 'ping')
  advance(PING_INTERVAL_MS * 2)
  assert.equal(raw.posted.length, 3)
})

test('a worker error event kills the host once and calls dead with the reason', () => {
  const { raw, deaths } = rig()
  let prevented = false
  raw.onerror?.({ message: 'ReferenceError: x is not defined', preventDefault: () => (prevented = true) })
  raw.onerror?.({ message: 'again' })
  assert.deepEqual(deaths, [{ reason: 'crash', detail: 'ReferenceError: x is not defined' }])
  assert.equal(prevented, true)
  assert.equal(raw.terminated, 1)
})

test('terminate is idempotent and silences the host', () => {
  const { host, raw, received, deaths, advance } = rig()
  host.terminate()
  host.terminate()
  raw.emit({ type: 'ready', node: 'policy-b', at: 1 })
  host.post({ type: 'ping', at: 1 })
  advance(HANDSHAKE_TIMEOUT_MS * 2)
  assert.equal(received.length, 0)
  assert.equal(deaths.length, 0)
  assert.equal(raw.posted.length, 0)
})

test('a worker that cannot even be constructed is reported as a crash, asynchronously', () => {
  const { deaths, advance } = rig({ throwOnCreate: true })
  assert.equal(deaths.length, 0, 'not synchronously')
  advance(0)
  assert.deepEqual(deaths, [{ reason: 'crash', detail: 'blocked by CSP' }])
})
