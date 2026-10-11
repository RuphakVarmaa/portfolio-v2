import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { FromWorker, NodeId, ServiceId, ToWorker } from '../../../cluster/protocol.ts'
import { createScheduler } from '../../../cluster/scheduler.ts'
import type { HostHandlers, WorkerHost } from '../../../cluster/worker-host.ts'
import { runBatch } from '../../../lib/policy/fuzz.ts'
import type { ReplayTimers } from '../../../lib/review/replay.ts'
import { createPolicyStore, type PolicyState } from './policy-store.ts'

/**
 * The policy store, driven with the REAL scheduler and fuzz runner against fake workers that run the REAL
 * engine, a fake live region and a fake clock for the slow-motion replay.
 */

class EngineWorker implements WorkerHost {
  node: NodeId
  terminated = false
  private handlers: HostHandlers
  constructor(node: NodeId, handlers: HostHandlers) {
    this.node = node
    this.handlers = handlers
    setImmediate(() => this.deliver({ type: 'ready', node: this.node, at: 0 }))
  }
  private deliver(msg: FromWorker) {
    if (!this.terminated) this.handlers.message(msg)
  }
  post(msg: ToWorker) {
    if (msg.type !== 'job' || this.terminated) return
    const payload = msg.payload as { n: number; seed: number; batch: number }
    setImmediate(() => {
      if (!this.terminated) this.deliver({ type: 'result', id: msg.id, result: { ...runBatch(payload), node: this.node } })
    })
  }
  terminate() {
    this.terminated = true
  }
}

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

function rig(options: { stepMs?: number; supported?: boolean; failLoad?: boolean } = {}) {
  const scheduler = createScheduler({
    createHost: (service: ServiceId, index: number, handlers: HostHandlers) => new EngineWorker(`${service}-${'abcdefgh'[index]}`, handlers),
    isSupported: () => options.supported ?? true,
  })
  const announced: string[] = []
  const clock = fakeTimers()
  const store = createPolicyStore({
    scheduler,
    announce: (text) => announced.push(text),
    loadFuzz: () => (options.failLoad ? Promise.reject(new Error('no chunk')) : import('../../../lib/policy/fuzz-run.ts')),
    stepMs: () => options.stepMs ?? 240,
    timers: clock.timers,
  })
  const states: PolicyState[] = []
  store.subscribe(() => states.push(store.getSnapshot()))
  return { store, announced, clock, states }
}

test('the idle state is constant, on the server and before any run', () => {
  const { store } = rig()
  assert.equal(store.getServerSnapshot(), store.getSnapshot(), 'the same idle object, so the prerendered HTML never differs')
  assert.deepEqual(store.getSnapshot(), { tape: [], run: null, busy: false, stages: [], shown: null })
})

test('a plain fuzz: busy while it runs, 10,000 evaluations, 0 leaks, the result line on the tape and announced once', async () => {
  const { store, announced, states } = rig()
  await store.start({ plug: false })
  const state = store.getSnapshot()
  assert.equal(state.busy, false)
  assert.equal(state.run?.status, 'done')
  assert.equal(state.run?.summary?.evaluated, 10_000)
  assert.equal(state.run?.summary?.leaks, 0)
  assert.deepEqual(state.stages.map((stage) => stage.name), ['verify', 'evaluate', 'audit'])
  assert.equal(state.shown, null, 'no replay: every stage is on show as soon as the run ends')
  assert.ok(states.some((s) => s.busy), 'it was busy while running')

  const result = state.tape.at(-1)
  assert.match(result?.text ?? '', /^0 cross-tenant leaks · 10,000 evaluations · [\d,]+ evals\/s · p95 [\d.]+ ms · verified in your browser just now$/)
  assert.equal(result?.tone, 'cobalt')
  assert.deepEqual(announced, [result?.text], 'the result is announced exactly once')
})

test('a second start while one is running is ignored', async () => {
  const { store } = rig()
  const first = store.start({ plug: false })
  const second = store.start({ plug: false })
  await Promise.all([first, second])
  assert.equal(store.getSnapshot().run?.id, 1, 'one run only')
})

test('the unplugged run: the retry sentence is on the tape and the fuzz still counts 10,000', async () => {
  const { store } = rig()
  await store.start({ plug: true })
  const state = store.getSnapshot()
  assert.equal(state.run?.summary?.plugged, true)
  assert.equal(state.run?.summary?.evaluated, 10_000)
  const lines = state.tape.map((line) => line.text)
  assert.ok(lines.some((text) => /^policy-b unplugged · batch \d+ in flight$/.test(text)))
  assert.ok(lines.some((text) => /^retry 1 · batch \d+ → policy-[ab] · recovered in \d+ ms$/.test(text)))
})

test('"Show me the pipeline": the stages are replayed one at a time, the first at once, then one per step', async () => {
  const { store, clock, announced } = rig({ stepMs: 240 })
  await store.start({ plug: false, replay: true })
  assert.equal(store.getSnapshot().stages.length, 3)
  assert.equal(store.getSnapshot().shown, 1, 'the first stage is lit the moment the run ends')
  assert.equal(announced.length, 1, 'the result is announced at the end of the run, not after the replay')
  clock.advance(239)
  assert.equal(store.getSnapshot().shown, 1)
  clock.advance(1)
  assert.equal(store.getSnapshot().shown, 2)
  clock.advance(240)
  assert.equal(store.getSnapshot().shown, 3)
  assert.equal(clock.pending(), 0)
  assert.equal(announced.length, 1, 'the replay announces nothing')
})

test('under lite motion (a step of 0) there is no replay: every stage shows when the run ends', async () => {
  const { store, clock } = rig({ stepMs: 0 })
  await store.start({ plug: false, replay: true })
  assert.equal(store.getSnapshot().shown, null)
  assert.equal(store.getSnapshot().stages.length, 3)
  assert.equal(clock.pending(), 0)
})

test('a run that is not a "Show me the pipeline" run is never replayed, whatever the step', async () => {
  const { store, clock } = rig({ stepMs: 240 })
  await store.start({ plug: false })
  assert.equal(store.getSnapshot().shown, null)
  assert.equal(clock.pending(), 0)
})

test('starting again stops a replay that is still going and clears the stages', async () => {
  const { store, clock } = rig({ stepMs: 240 })
  await store.start({ plug: false, replay: true })
  clock.advance(240)
  assert.equal(store.getSnapshot().shown, 2)
  const next = store.start({ plug: false })
  assert.deepEqual(store.getSnapshot().stages, [], 'the stages are cleared the moment a new run starts')
  assert.equal(store.getSnapshot().shown, null)
  assert.equal(clock.pending(), 0, 'the old replay timer is gone')
  await next
  assert.equal(store.getSnapshot().run?.id, 2)
})

test('without Worker support the run fails cleanly: an error is announced, nothing is lit', async () => {
  const { store, announced } = rig({ supported: false })
  await store.start({ plug: false, replay: true })
  const state = store.getSnapshot()
  assert.equal(state.run?.status, 'failed')
  assert.deepEqual(state.stages, [])
  assert.equal(state.shown, null)
  assert.equal(state.busy, false)
  assert.equal(announced.length, 1)
  assert.match(announced[0], /Web Workers are not available/)
})

test('if the fuzz chunk cannot be loaded the store says so on the tape and is not left busy', async () => {
  const { store } = rig({ failLoad: true })
  await store.start({ plug: false })
  const state = store.getSnapshot()
  assert.equal(state.busy, false)
  assert.equal(state.run, null)
  assert.deepEqual(state.tape.map((line) => line.text), ['The fuzz could not be loaded.'])
})

test('tape lines get store-unique ids and the tape is capped', () => {
  const { store } = rig()
  const first = store.line('a', 'ink')
  const second = store.line('b', 'ink')
  assert.notEqual(first.id, second.id)
  store.addTape(Array.from({ length: 450 }, (_, index) => store.line(`line ${index}`, 'muted')))
  const tape = store.getSnapshot().tape
  assert.equal(tape.length, 400)
  assert.equal(tape.at(-1)?.text, 'line 449', 'the newest lines are kept')
  store.addTape([])
  assert.equal(store.getSnapshot().tape, tape, 'adding nothing changes nothing')
})
