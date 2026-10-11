import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { FromWorker, JobKind, NodeId, ServiceId, ToWorker } from './protocol.ts'
import { createScheduler, MAX_SPANS } from './scheduler.ts'
import type { HostHandlers, WorkerHost } from './worker-host.ts'

/** A manual clock + timer queue so every test is deterministic. */
class FakeClock {
  t = 0
  private seq = 0
  private timers = new Map<number, { at: number; fn: () => void }>()
  now = () => this.t
  setTimer = (fn: () => void, ms: number): unknown => {
    const id = ++this.seq
    this.timers.set(id, { at: this.t + ms, fn })
    return id
  }
  clearTimer = (handle: unknown) => {
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
      this.timers.delete(due[0])
      due[1].fn()
    }
    this.t = target
  }
}

class FakeHost implements WorkerHost {
  node: NodeId
  handlers: HostHandlers
  posted: ToWorker[] = []
  terminated = false
  constructor(node: NodeId, handlers: HostHandlers) {
    this.node = node
    this.handlers = handlers
  }
  post(msg: ToWorker) {
    if (!this.terminated) this.posted.push(msg)
  }
  terminate() {
    this.terminated = true
  }
  /** What the worker would send. Ignored once terminated, like a real dead worker. */
  send(msg: FromWorker) {
    if (!this.terminated) this.handlers.message(msg)
  }
  ready() {
    this.send({ type: 'ready', node: this.node, at: 0 })
  }
  jobs() {
    return this.posted.filter((m): m is Extract<ToWorker, { type: 'job' }> => m.type === 'job')
  }
  result(id: string, result: unknown) {
    this.send({ type: 'result', id, result })
  }
  error(id: string, message: string, retryable: boolean) {
    this.send({ type: 'error', id, message, retryable })
  }
}

function rig(options: { supported?: boolean } = {}) {
  const clock = new FakeClock()
  const hosts: FakeHost[] = []
  const messages: Array<{ dir: 'in' | 'out'; service: ServiceId; type: string; node: NodeId }> = []
  const scheduler = createScheduler({
    createHost: (service, index, handlers) => {
      const node = `${service}-${'abcdefgh'[index]}`
      const host = new FakeHost(node, handlers)
      hosts.push(host)
      return host
    },
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    isSupported: () => options.supported ?? true,
  })
  scheduler.onMessage((dir, service, msg, node) => messages.push({ dir, service, type: msg.type, node }))
  const hostFor = (node: NodeId): FakeHost => {
    const found = [...hosts].reverse().find((host) => host.node === node)
    assert.ok(found, `no host for ${node}`)
    return found
  }
  return { clock, hosts, hostFor, messages, scheduler }
}

const fuzz = (batch: number) => ({ n: 1000, seed: 7, batch })
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

test('submit spawns the pool lazily and dispatches FIFO, one job at a time per node', async () => {
  const { scheduler, hosts, hostFor } = rig()
  assert.equal(hosts.length, 0, 'nothing is spawned until a job or ensureService asks')

  const first = scheduler.submit('review.analyze', { source: 'a', filename: 'a.js' })
  const second = scheduler.submit('review.analyze', { source: 'b', filename: 'b.js' })
  assert.equal(hosts.length, 1, 'review has a pool of one')
  assert.equal(hostFor('review-a').jobs().length, 0, 'nothing is posted before ready')

  hostFor('review-a').ready()
  assert.deepEqual(hostFor('review-a').jobs().map((j) => j.id), [first.id], 'FIFO: first job only, concurrency is 1')
  assert.equal(scheduler.getState().nodes['review-a'].status, 'busy')

  hostFor('review-a').result(first.id, { findings: [], stages: [], parsed: true })
  assert.deepEqual(await first.promise, { findings: [], stages: [], parsed: true })
  assert.deepEqual(hostFor('review-a').jobs().map((j) => j.id), [first.id, second.id], 'second dispatched after the first finished')

  hostFor('review-a').result(second.id, { findings: [], stages: [], parsed: false })
  assert.equal((await second.promise).parsed, false)
  assert.equal(scheduler.getState().nodes['review-a'].status, 'ready')
  assert.equal(scheduler.getState().nodes['review-a'].jobs, 2)
})

test('the policy pool of two spreads batches across policy-a and policy-b', () => {
  const { scheduler, hosts, hostFor } = rig()
  const handles = [1, 2, 3, 4].map((batch) => scheduler.submit('policy.fuzz', fuzz(batch)))
  assert.deepEqual(hosts.map((h) => h.node), ['policy-a', 'policy-b'])
  hostFor('policy-a').ready()
  hostFor('policy-b').ready()

  assert.deepEqual(hostFor('policy-a').jobs().map((j) => j.id), [handles[0].id])
  assert.deepEqual(hostFor('policy-b').jobs().map((j) => j.id), [handles[1].id])
  assert.deepEqual(
    scheduler.getState().queue.map((q) => [q.id, q.node ?? null]),
    [
      [handles[0].id, 'policy-a'],
      [handles[1].id, 'policy-b'],
      [handles[2].id, null],
      [handles[3].id, null],
    ],
  )

  hostFor('policy-b').result(handles[1].id, { evaluated: 1000, leaks: 0, p95us: 5, totalMs: 4, sample: [] })
  assert.equal(hostFor('policy-b').jobs().at(-1)?.id, handles[2].id, 'the node that freed up takes the next job')
})

test('a retryable error is retried at the front of the queue; the job rejects after maxAttempts', async () => {
  const { scheduler, hostFor } = rig()
  const job = scheduler.submit('review.analyze', { source: 'x', filename: 'x.js' }, { maxAttempts: 2 })
  const other = scheduler.submit('review.analyze', { source: 'y', filename: 'y.js' })
  hostFor('review-a').ready()
  const host = hostFor('review-a')

  host.error(job.id, 'transient', true)
  assert.deepEqual(host.jobs().map((j) => j.id), [job.id, job.id], 'retried before the job that was waiting behind it')
  assert.equal(scheduler.getState().spans.filter((s) => s.id === job.id).length, 2)

  host.error(job.id, 'transient again', true)
  await assert.rejects(job.promise, /failed after 2 attempts: transient again/)
  assert.deepEqual(host.jobs().map((j) => j.id).slice(-1), [other.id], 'the queue keeps moving after a final failure')
  assert.match(scheduler.getState().lastEvent ?? '', /review\.analyze failed after 2 attempts/)
})

test('a non-retryable error rejects immediately with the worker message', async () => {
  const { scheduler, hostFor } = rig()
  const job = scheduler.submit('review.analyze', { source: 'x', filename: 'x.js' })
  hostFor('review-a').ready()
  hostFor('review-a').error(job.id, 'no handler', false)
  await assert.rejects(job.promise, (error: Error) => error.message === 'no handler')
  assert.equal(hostFor('review-a').jobs().length, 1, 'never retried')
  assert.equal(scheduler.getState().spans[0].outcome, 'error')
})

test('pullThePlug terminates the worker, retries its job on the sibling and records recoveredMs', async () => {
  const { scheduler, clock, hosts, hostFor } = rig()
  const [b1, b2, b3] = [1, 2, 3].map((batch) => scheduler.submit('policy.fuzz', fuzz(batch)))
  hostFor('policy-a').ready()
  hostFor('policy-b').ready()
  assert.equal(hostFor('policy-a').jobs()[0].id, b1.id)
  assert.equal(hostFor('policy-b').jobs()[0].id, b2.id)

  clock.advance(10)
  const unplugged = scheduler.pullThePlug('policy', 1)
  assert.deepEqual(unplugged, { node: 'policy-b', inFlight: [b2.id] })
  assert.equal(hostFor('policy-b').terminated, true, 'Worker.terminate() was really called')
  assert.equal(scheduler.getState().nodes['policy-b'].status, 'dead')
  assert.equal(scheduler.getState().lastEvent, 'policy-b unplugged · batch 2 in flight')

  // The interrupted attempt is on the record as terminated; the job is back in the queue at the front.
  const interrupted = scheduler.getState().spans.find((s) => s.id === b2.id)
  assert.equal(interrupted?.outcome, 'terminated')
  assert.equal(interrupted?.node, 'policy-b')
  assert.deepEqual(scheduler.getState().queue.map((q) => q.id), [b1.id, b2.id, b3.id])
  assert.equal(scheduler.getState().queue[1].attempts, 1)

  // The same NodeId is respawned after 0 ms and stays dead until it posts ready.
  const before = hosts.length
  clock.advance(0)
  assert.equal(hosts.length, before + 1, 'respawned')
  assert.equal(scheduler.getState().nodes['policy-b'].status, 'dead')
  assert.equal(scheduler.getState().nodes['policy-b'].respawns, 1)

  // policy-a finishes batch 1 after 28 ms and picks the retried batch up (it is at the front).
  clock.advance(28)
  hostFor('policy-a').result(b1.id, { evaluated: 1000, leaks: 0, p95us: 5, totalMs: 4, sample: [] })
  const retried = hostFor('policy-a').jobs().at(-1)
  assert.equal(retried?.id, b2.id, 'batch 2 retried on policy-a')

  clock.advance(10)
  hostFor('policy-a').result(b2.id, { evaluated: 1000, leaks: 0, p95us: 6, totalMs: 4, sample: ['line'] })
  assert.equal((await b2.promise).evaluated, 1000)

  const state = scheduler.getState()
  const recoveredSpan = state.spans.find((s) => s.id === b2.id && s.attempts === 2)
  assert.equal(recoveredSpan?.outcome, 'ok')
  assert.equal(recoveredSpan?.node, 'policy-a')
  assert.equal(recoveredSpan?.recoveredMs, 38, 'failure at t=10, retried result at t=48')
  assert.equal(state.recovery?.sentence, 'retry 1 · batch 2 → policy-a · recovered in 38 ms')
  assert.equal(state.lastEvent, 'retry 1 · batch 2 → policy-a · recovered in 38 ms')

  // policy-a took batch 3 the moment it finished the retried batch; the respawned worker comes back idle.
  assert.equal(hostFor('policy-a').jobs().at(-1)?.id, b3.id)
  hostFor('policy-b').ready()
  assert.equal(scheduler.getState().nodes['policy-b'].status, 'ready')
  assert.equal(scheduler.getState().nodes['policy-b'].readyAt, clock.t)
  hostFor('policy-a').result(b3.id, { evaluated: 1000, leaks: 0, p95us: 5, totalMs: 4, sample: [] })
  assert.equal((await b3.promise).leaks, 0)
  assert.equal(scheduler.getState().queue.length, 0)
})

test('pullThePlug with no index prefers the busy node and never throws on an idle or unknown pool', () => {
  const { scheduler, hostFor } = rig()
  assert.deepEqual(scheduler.pullThePlug('review'), { node: 'review-a', inFlight: [] }, 'nothing spawned: a harmless no-op')
  const handle = scheduler.submit('policy.fuzz', fuzz(1))
  hostFor('policy-a').ready()
  hostFor('policy-b').ready()
  const result = scheduler.pullThePlug('policy')
  assert.equal(result.node, 'policy-a', 'the node that was running something')
  assert.deepEqual(result.inFlight, [handle.id])
})

test('a job submitted with transferables is never retried', async () => {
  const { scheduler, hostFor } = rig()
  const bitmap = {} as ImageBitmap
  const job = scheduler.submit('vision.detect', { bitmap, ts: 1 }, { transfer: [bitmap as unknown as Transferable] })
  hostFor('vision-a').ready()
  scheduler.pullThePlug('vision', 0)
  await assert.rejects(job.promise, /terminated/)
  assert.equal(scheduler.getState().spans.filter((s) => s.id === job.id).length, 1)
})

test('a per-attempt timeout terminates the node and retries after the respawn', async () => {
  const { scheduler, clock, hosts, hostFor } = rig()
  const job = scheduler.submit('review.analyze', { source: 'loop', filename: 'a.js' }, { timeoutMs: 100 })
  hostFor('review-a').ready()
  const stuck = hostFor('review-a')
  clock.advance(100) // fires the timeout, which terminates the worker and (0 ms later) respawns it
  assert.equal(stuck.terminated, true)
  assert.equal(scheduler.getState().spans[0].outcome, 'timeout')
  assert.equal(hosts.length, 2, 'respawned')
  assert.equal(scheduler.getState().nodes['review-a'].status, 'dead', 'dead until the new worker is ready')
  hostFor('review-a').ready()
  assert.equal(hostFor('review-a').jobs().length, 1, 'the retry went to the new worker')
  hostFor('review-a').result(job.id, { findings: [], stages: [], parsed: true })
  assert.equal((await job.promise).parsed, true)
  assert.equal(scheduler.getState().spans[1].attempts, 2)
  assert.equal(scheduler.getState().recovery?.retry, 1)
})

test('cancel removes a queued job and posts cancel for a running one', async () => {
  const { scheduler, hostFor } = rig()
  const running = scheduler.submit('review.analyze', { source: 'a', filename: 'a.js' })
  const queued = scheduler.submit('review.analyze', { source: 'b', filename: 'b.js' })
  hostFor('review-a').ready()

  queued.cancel()
  await assert.rejects(queued.promise, (error: Error) => error.name === 'AbortError')
  assert.deepEqual(scheduler.getState().queue.map((q) => q.id), [running.id])

  running.cancel()
  await assert.rejects(running.promise, (error: Error) => error.name === 'AbortError')
  assert.ok(hostFor('review-a').posted.some((m) => m.type === 'cancel' && m.id === running.id))
  assert.equal(scheduler.getState().nodes['review-a'].status, 'ready', 'the slot is free immediately')

  // A late result for a cancelled job is ignored.
  hostFor('review-a').result(running.id, { findings: [], stages: [], parsed: true })
  assert.equal(scheduler.getState().nodes['review-a'].jobs, 0)
})

test('progress messages reach onProgress with the right job id', () => {
  const { scheduler, hostFor } = rig()
  const seen: Array<number | undefined> = []
  const job = scheduler.submit('retrieval.loadModel', { modelUrl: '/m', wasmBase: '/ort/' }, { onProgress: (p) => seen.push(p.bytesLoaded) })
  hostFor('retrieval-a').ready()
  hostFor('retrieval-a').send({ type: 'progress', id: job.id, bytesLoaded: 10, bytesTotal: 100 })
  hostFor('retrieval-a').send({ type: 'progress', id: 'someone-else', bytesLoaded: 99 })
  hostFor('retrieval-a').send({ type: 'progress', id: job.id, bytesLoaded: 50, bytesTotal: 100 })
  assert.deepEqual(seen, [10, 50])
})

test('retrieval nodes accept several jobs in flight (a search can run during a model download)', () => {
  const { scheduler, hostFor } = rig()
  const load = scheduler.submit('retrieval.loadModel', { modelUrl: '/m', wasmBase: '/ort/' })
  const search = scheduler.submit('retrieval.search', { query: 'pgvector', mode: 'bm25', topK: 5 })
  hostFor('retrieval-a').ready()
  assert.deepEqual(hostFor('retrieval-a').jobs().map((j) => j.id), [load.id, search.id])
})

test('spans are capped at 200, oldest dropped', () => {
  const { scheduler, hostFor } = rig()
  const first = scheduler.submit('review.analyze', { source: 'a', filename: 'a.js' })
  hostFor('review-a').ready()
  let lastId = first.id
  hostFor('review-a').result(first.id, { findings: [], stages: [], parsed: true })
  for (let i = 0; i < MAX_SPANS + 5; i++) {
    const job = scheduler.submit('review.analyze', { source: String(i), filename: 'a.js' })
    hostFor('review-a').result(job.id, { findings: [], stages: [], parsed: true })
    lastId = job.id
  }
  const { spans } = scheduler.getState()
  assert.equal(spans.length, MAX_SPANS)
  assert.equal(spans.at(-1)?.id, lastId)
  assert.ok(spans.every((s) => s.id !== first.id), 'the oldest span was dropped')
  assert.ok(spans.every((s) => s.outcome === 'ok' && s.end !== undefined))
})

test('onMessage reports job, result and progress in both directions but never ping or pong', () => {
  const { scheduler, hostFor, messages } = rig()
  const job = scheduler.submit('review.analyze', { source: 'a', filename: 'a.js' })
  hostFor('review-a').ready()
  hostFor('review-a').send({ type: 'pong', at: 0 })
  hostFor('review-a').result(job.id, { findings: [], stages: [], parsed: true })
  assert.deepEqual(
    messages.map((m) => `${m.dir}:${m.type}`),
    ['in:ready', 'out:job', 'in:result'],
  )
  assert.ok(messages.every((m) => m.service === 'review' && m.node === 'review-a'))
})

test('ensureService resolves once the whole pool is ready and rejects without Worker support', async () => {
  const { scheduler, hostFor } = rig()
  let resolved = false
  const ensured = scheduler.ensureService('policy').then(() => {
    resolved = true
  })
  hostFor('policy-a').ready()
  await flush()
  assert.equal(resolved, false, 'policy-b is not ready yet')
  hostFor('policy-b').ready()
  await ensured
  assert.equal(resolved, true)
  await scheduler.ensureService('policy') // already ready: resolves immediately

  const unsupported = rig({ supported: false })
  await assert.rejects(unsupported.scheduler.ensureService('review'), /not available/)
  const handle = unsupported.scheduler.submit('review.analyze', { source: 'a', filename: 'a.js' })
  await assert.rejects(handle.promise, /not available/)
})

test('a worker that never becomes ready is dead for good and its queued jobs are rejected', async () => {
  const { scheduler, hostFor } = rig()
  const job = scheduler.submit('review.analyze', { source: 'a', filename: 'a.js' })
  const ensured = scheduler.ensureService('review')
  hostFor('review-a').handlers.dead('handshake-timeout', 'no ready message within 10000 ms')
  await assert.rejects(job.promise, /not available/)
  await assert.rejects(ensured, /not available/)
  assert.equal(scheduler.getState().nodes['review-a'].status, 'dead')
  assert.match(scheduler.getState().lastEvent ?? '', /review-a did not start/)
})

test('a crashed worker is respawned a limited number of times and its job is retried', async () => {
  const { scheduler, clock, hosts, hostFor } = rig()
  const job = scheduler.submit('review.analyze', { source: 'a', filename: 'a.js' })
  hostFor('review-a').ready()
  hostFor('review-a').handlers.dead('crash', 'boom')
  assert.equal(scheduler.getState().spans[0].outcome, 'error')
  clock.advance(0)
  assert.equal(hosts.length, 2)
  hostFor('review-a').ready()
  hostFor('review-a').result(job.id, { findings: [], stages: [], parsed: true })
  await job.promise
  assert.equal(scheduler.getState().recovery?.node, 'review-a')
})

test('state snapshots are stable references until something changes, and notifications coalesce', async () => {
  const { scheduler, hostFor } = rig()
  let notifications = 0
  scheduler.subscribe(() => {
    notifications += 1
  })
  scheduler.submit('review.analyze', { source: 'a', filename: 'a.js' })
  hostFor('review-a').ready()
  hostFor('review-a').send({ type: 'log', level: 'info', text: 'hi' })
  await flush()
  assert.equal(notifications, 1, 'several changes in one tick produce one notification')

  const a = scheduler.getState()
  const b = scheduler.getState()
  assert.equal(a, b)
  const nodesBefore = a.nodes
  scheduler.submit('policy.fuzz', fuzz(1)) // spawns another service; review-a is untouched
  const after = scheduler.getState()
  assert.notEqual(after, a)
  assert.equal(after.nodes['review-a'], nodesBefore['review-a'], 'unchanged node records keep their identity')
})

test('every JobKind routes to the pool of its own service', () => {
  const { scheduler, hosts } = rig()
  const kinds: JobKind[] = ['retrieval.warm', 'vision.warm', 'policy.evaluate', 'review.analyze']
  const payloads = [
    { corpusUrl: '/retrieval/corpus.json' },
    {},
    { tenant: 'A', actorTenant: 'A', role: 'owner', resource: 'task', action: 'read', resourceTenant: 'A' },
    { source: '', filename: 'a.js' },
  ]
  kinds.forEach((kind, i) => scheduler.submit(kind, payloads[i] as never))
  assert.deepEqual(
    hosts.map((h) => h.node),
    ['retrieval-a', 'vision-a', 'policy-a', 'policy-b', 'review-a'],
  )
})
