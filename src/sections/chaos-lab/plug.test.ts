import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { FromWorker, NodeId, ServiceId, ToWorker } from '../../cluster/protocol.ts'
import { createScheduler, type ClusterSpan } from '../../cluster/scheduler.ts'
import type { HostHandlers, WorkerHost } from '../../cluster/worker-host.ts'
import { BATCH_SCALE_STEP, FUZZ_PER_BATCH, MAX_BATCH_SCALE, PLUG_DELAY_MS, deriveBatches, findRecovery, nextBatchScale, runPlug, runningOn, singleFlight, type PlugRun, type PlugSink } from './plug.ts'

// ---- a real scheduler, fake workers, a manual clock -----------------------------------------------

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
      const due = [...this.timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0]
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
  answered = new Set<string>()
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
  send(msg: FromWorker) {
    if (!this.terminated) this.handlers.message(msg)
  }
  ready() {
    this.send({ type: 'ready', node: this.node, at: 0 })
  }
  /** Jobs this host was given and has not answered yet. */
  pending() {
    return this.posted.filter((m): m is Extract<ToWorker, { type: 'job' }> => m.type === 'job' && !this.answered.has(m.id))
  }
  answer(id: string, result: unknown = { evaluated: 1000, leaks: 0, p95us: 5, totalMs: 4, sample: [] }) {
    this.answered.add(id)
    this.send({ type: 'result', id, result })
  }
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

function rig() {
  const clock = new FakeClock()
  const hosts: FakeHost[] = []
  const scheduler = createScheduler({
    createHost: (service: ServiceId, index: number, handlers: HostHandlers) => {
      const host = new FakeHost(`${service}-${'abcdefgh'[index]}`, handlers)
      hosts.push(host)
      return host
    },
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    isSupported: () => true,
  })
  const hostFor = (node: NodeId): FakeHost => {
    const found = [...hosts].reverse().find((host) => host.node === node)
    assert.ok(found, `no host for ${node}`)
    return found
  }
  const updates: PlugRun[] = []
  const logs: string[] = []
  const sink: PlugSink = { update: (run) => void updates.push(run), log: (text) => void logs.push(text) }
  const deps = { scheduler, now: clock.now, random: () => 0.5, setTimer: clock.setTimer, clearTimer: clock.clearTimer }
  return { clock, hosts, hostFor, scheduler, sink, deps, updates, logs }
}

/** Bring both policy nodes up, so `ensureService` resolves and the run submits its batches. */
async function boot(r: ReturnType<typeof rig>) {
  await flush()
  r.hostFor('policy-a').ready()
  r.hostFor('policy-b').ready()
  await flush()
}

// ---- pure helpers ---------------------------------------------------------------------------------

const span = (patch: Partial<ClusterSpan> & Pick<ClusterSpan, 'id' | 'node' | 'attempts'>): ClusterSpan => ({
  kind: 'policy.fuzz',
  start: 0,
  ...patch,
})

test('batch cells come straight from the queue and the spans', () => {
  const jobs = [1, 2, 3, 4, 5].map((batch) => ({ id: `j${batch}`, batch }))
  const state = {
    queue: [
      { id: 'j3', kind: 'policy.fuzz' as const, attempts: 1, node: 'policy-a' },
      { id: 'j4', kind: 'policy.fuzz' as const, attempts: 1 }, // requeued after the plug was pulled
      { id: 'j5', kind: 'policy.fuzz' as const, attempts: 0 },
    ],
    spans: [
      span({ id: 'j1', node: 'policy-a', attempts: 1, start: 0, end: 3, outcome: 'ok' }),
      span({ id: 'j2', node: 'policy-b', attempts: 1, start: 0, end: 2, outcome: 'terminated' }),
      span({ id: 'j2', node: 'policy-a', attempts: 2, start: 4, end: 9.5, outcome: 'ok', recoveredMs: 7.5 }),
    ],
  }
  const cells = deriveBatches(jobs, state)
  assert.deepEqual(
    cells.map((c) => [c.batch, c.state, c.node]),
    [
      [1, 'done', 'policy-a'],
      [2, 'retried', 'policy-a'],
      [3, 'running', 'policy-a'],
      [4, 'retrying', null],
      [5, 'queued', null],
    ],
  )
  assert.equal(cells[0].ms, 3)
  assert.equal(cells[1].ms, 5.5, 'the duration of the attempt that succeeded')
  assert.equal(deriveBatches([{ id: 'j9', batch: 9 }], { queue: [], spans: [] })[0].state, 'failed')
})

test('the recovery is the first of our jobs that succeeded after a failure; other jobs do not count', () => {
  const jobs = [{ id: 'j2', batch: 2 }]
  const spans = [
    span({ id: 'other', node: 'policy-a', attempts: 2, outcome: 'ok', recoveredMs: 99 }),
    span({ id: 'j2', node: 'policy-a', attempts: 2, outcome: 'ok', recoveredMs: 7.5 }),
  ]
  assert.deepEqual(findRecovery(jobs, spans), { jobId: 'j2', batch: 2, node: 'policy-a', retry: 1, ms: 7.5 })
  assert.equal(findRecovery([{ id: 'j7', batch: 7 }], spans), null)
  assert.equal(runningOn(jobs, { queue: [{ id: 'j2', kind: 'policy.fuzz', attempts: 1, node: 'policy-b' }] }, 'policy-b')?.batch, 2)
  assert.equal(runningOn(jobs, { queue: [{ id: 'zzz', kind: 'policy.fuzz', attempts: 1, node: 'policy-b' }] }, 'policy-b'), null, 'someone else\'s job is not ours')
})

// ---- the whole experiment, against the real scheduler ---------------------------------------------

test('pull the plug: a batch in flight on policy-b is killed, retried, and the fuzz still completes', async () => {
  const r = rig()
  const run = runPlug(r.deps, r.sink, { mode: 'plug' })
  await boot(r)
  const a = r.hostFor('policy-a')
  const b = r.hostFor('policy-b')
  assert.equal(a.pending().length, 1)
  assert.equal(b.pending().length, 1)

  // Batches 1 and 2 finish, one result per task, like real message events.
  r.clock.advance(3)
  a.answer(a.pending()[0].id)
  await flush()
  r.clock.advance(1)
  b.answer(b.pending()[0].id)
  await flush()

  // Two are done, so the plug is aimed at the batch now running on policy-b, and pulled a moment later.
  assert.equal(b.terminated, false, 'not yet: the batch is given a moment to be really running')
  r.clock.advance(PLUG_DELAY_MS)
  assert.equal(b.terminated, true, 'the node was really terminated')
  const events = r.scheduler.getState().lastEvent
  assert.match(events ?? '', /^policy-b unplugged · batch \d+ in flight$/)

  // Everything else runs on the survivor until the respawned policy-b is ready.
  r.clock.advance(5)
  while (a.pending().length > 0) {
    a.answer(a.pending()[0].id)
    r.clock.advance(2)
    await flush()
  }
  r.clock.advance(0) // the respawn timer (0 ms)
  const reborn = r.hostFor('policy-b')
  assert.notEqual(reborn, b, 'a fresh worker replaced the dead one')
  r.clock.advance(30)
  reborn.ready()
  await flush()
  for (let guard = 0; guard < 40; guard++) {
    const work = [a, reborn].flatMap((host) => host.pending().map((job) => ({ host, job })))
    if (work.length === 0) break
    for (const { host, job } of work) host.answer(job.id)
    r.clock.advance(2)
    await flush()
  }

  const result = await run
  assert.equal(result.phase, 'done', result.error ?? '')
  assert.equal(result.killed?.node, 'policy-b')
  assert.ok(result.killed?.batch === 3 || result.killed?.batch === 4)
  assert.equal(result.killed?.inFlightMs, PLUG_DELAY_MS, 'measured from the dispatch of the batch to the plug being pulled')
  assert.ok(result.recovery, 'a real recovery was observed')
  assert.equal(result.recovery.retry, 1)
  assert.ok(result.recovery.ms > 0)
  assert.equal(result.recovery.batch, result.killed.batch, 'the retried batch is the one that was killed')
  assert.equal(r.scheduler.getState().recovery?.ms, result.recovery.ms, 'same number as the scheduler printed')
  assert.ok(result.respawnMs !== null && result.respawnMs > 0)
  assert.equal(result.totals?.evaluated, 10_000)
  assert.equal(result.totals?.leaks, 0)
  assert.equal(result.batches.length, 10)
  assert.equal(result.batches.filter((c) => c.state === 'retried').length, 1)
  assert.equal(result.batches.filter((c) => c.state === 'done').length, 9)
  assert.ok(result.spans.some((s) => s.outcome === 'terminated'), 'the terminated attempt is in the spans')
  assert.ok(r.logs[0].startsWith(`fuzz started · 10 batches × ${FUZZ_PER_BATCH.toLocaleString('en-US')} evaluations`))
  assert.ok(r.logs.at(-1)?.startsWith('fuzz finished · 10,000 evaluations · 0 leaks · policy-b back in'))
})

test('if the aimed batch finishes before the plug is pulled, the next one is aimed at instead', async () => {
  const r = rig()
  const run = runPlug(r.deps, r.sink, { mode: 'plug' })
  await boot(r)
  const a = r.hostFor('policy-a')
  const b = r.hostFor('policy-b')
  a.answer(a.pending()[0].id)
  await flush()
  b.answer(b.pending()[0].id)
  await flush() // two done: aimed at policy-b's next batch
  const aimed = b.pending()[0]
  assert.ok(aimed)
  b.answer(aimed.id) // ... which finishes before the timer fires
  await flush()
  assert.equal(b.terminated, false)
  const second = b.pending()[0]
  assert.ok(second && second.id !== aimed.id, 'policy-b started another batch')
  r.clock.advance(PLUG_DELAY_MS)
  assert.equal(b.terminated, true, 'the plug was pulled on the batch that was running at the time')
  // Let everything else finish.
  r.clock.advance(0)
  for (let guard = 0; guard < 60; guard++) {
    const nodes = ['policy-a', 'policy-b'] as const
    const work = nodes.flatMap((node) => r.hostFor(node).pending().map((job) => ({ host: r.hostFor(node), job })))
    if (work.length === 0) break
    for (const { host, job } of work) host.answer(job.id)
    r.clock.advance(2)
    await flush()
    if (r.hostFor('policy-b') !== b) r.hostFor('policy-b').ready()
  }
  const result = await run
  assert.equal(result.phase, 'done', result.error ?? '')
  assert.notEqual(result.killed?.batch, 4, 'it did not kill the batch that had already finished')
})

test('a plain fuzz never pulls a plug and ends with no recovery', async () => {
  const r = rig()
  const run = runPlug(r.deps, r.sink, { mode: 'fuzz', batches: 4 })
  await boot(r)
  for (let guard = 0; guard < 20; guard++) {
    const work = ['policy-a', 'policy-b'].flatMap((node) => r.hostFor(node).pending().map((job) => ({ host: r.hostFor(node), job })))
    if (work.length === 0) break
    for (const { host, job } of work) host.answer(job.id)
    await flush()
  }
  const result = await run
  assert.equal(result.phase, 'done')
  assert.equal(result.killed, null)
  assert.equal(result.recovery, null)
  assert.equal(result.totals?.evaluated, 4000)
  assert.equal(r.hostFor('policy-b').terminated, false)
})

test('if the fuzz ends before the plug can be pulled mid-batch, the run proves nothing and says so', async () => {
  const r = rig()
  const run = runPlug(r.deps, r.sink, { mode: 'plug', batches: 2 })
  await boot(r)
  r.hostFor('policy-a').answer(r.hostFor('policy-a').pending()[0].id)
  r.hostFor('policy-b').answer(r.hostFor('policy-b').pending()[0].id)
  await flush()
  const result = await run
  assert.equal(result.phase, 'error')
  assert.match(result.error ?? '', /before the plug could be pulled/)
  assert.equal(result.killed, null)
  assert.equal(result.tooQuick, true, 'and the run says why, so the next one can use bigger batches')
})

test('a quick machine gets bigger batches on the next run; nothing else changes the size', () => {
  assert.equal(nextBatchScale(1, { tooQuick: true }), BATCH_SCALE_STEP)
  assert.equal(nextBatchScale(BATCH_SCALE_STEP, { tooQuick: true }), BATCH_SCALE_STEP ** 2)
  assert.equal(nextBatchScale(MAX_BATCH_SCALE, { tooQuick: true }), MAX_BATCH_SCALE, 'it stops growing: a run is never made enormous')
  assert.equal(nextBatchScale(4, {}), 4)
  assert.equal(nextBatchScale(4, { tooQuick: false }), 4)
})

test('only one run is in flight at a time: asking again joins it, and a finished run frees the slot', async () => {
  let started = 0
  let finish: (value: string) => void = () => undefined
  const run = singleFlight((label: string) => {
    started += 1
    return new Promise<string>((resolve) => {
      finish = (value) => resolve(`${label}:${value}`)
    })
  })
  const first = run('plug')
  const joined = run('fuzz') // a different mode while the first runs: it gets the same run, it does not start another
  assert.equal(started, 1)
  assert.equal(first, joined)
  finish('done')
  assert.equal(await first, 'plug:done')
  assert.equal(started, 1)
  const next = run('fuzz')
  assert.equal(started, 2, 'the slot is free again')
  assert.notEqual(next, first)
  finish('again')
  assert.equal(await next, 'fuzz:again')
})

test('a run that fails frees the slot too', async () => {
  let started = 0
  const run = singleFlight(() => {
    started += 1
    return started === 1 ? Promise.reject(new Error('boom')) : Promise.resolve('fine')
  })
  await assert.rejects(run(), /boom/)
  assert.equal(await run(), 'fine')
  assert.equal(started, 2)
})

test('the batch size is a run option: the totals printed are what the workers reported, whatever the size', async () => {
  const r = rig()
  const run = runPlug(r.deps, r.sink, { mode: 'fuzz', batches: 2, perBatch: 50_000 })
  await boot(r)
  const sizes = ['policy-a', 'policy-b'].flatMap((node) => r.hostFor(node).pending().map((job) => (job.payload as { n: number }).n))
  assert.deepEqual(sizes, [50_000, 50_000])
  for (const node of ['policy-a', 'policy-b']) {
    const host = r.hostFor(node)
    host.answer(host.pending()[0].id, { evaluated: 123, leaks: 0, p95us: 5, totalMs: 4, sample: [] })
  }
  await flush()
  const result = await run
  assert.equal(result.totals?.evaluated, 246, 'summed from the results, not from the option')
  assert.ok(r.logs[0].includes('2 batches × 50,000 evaluations'))
})

test('a worker that cannot run the job (no handler yet) is reported honestly, not hidden', async () => {
  const r = rig()
  const run = runPlug(r.deps, r.sink, { mode: 'plug', batches: 3 })
  await boot(r)
  const a = r.hostFor('policy-a')
  a.answered.add(a.pending()[0].id)
  a.send({ type: 'error', id: a.posted.filter((m) => m.type === 'job')[0].id, message: 'Worker policy-a has no handler for policy.fuzz', retryable: false })
  await flush()
  // Drain the rest so every promise settles.
  for (let guard = 0; guard < 10; guard++) {
    for (const node of ['policy-a', 'policy-b'] as const) {
      const host = r.hostFor(node)
      for (const job of host.pending()) host.answer(job.id)
    }
    await flush()
  }
  const result = await run
  assert.equal(result.phase, 'error')
  assert.match(result.error ?? '', /no handler for policy\.fuzz/)
})

test('workers that never start end the run with a clear sentence instead of hanging', async () => {
  const r = rig()
  const run = runPlug(r.deps, r.sink, { mode: 'plug' })
  await flush()
  r.clock.advance(13_000)
  const result = await run
  assert.equal(result.phase, 'error')
  assert.match(result.error ?? '', /policy workers are not available/)
})
