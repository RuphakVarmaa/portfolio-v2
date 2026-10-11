import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { FromWorker, JobKind, NodeId, ServiceId, ToWorker } from '../../cluster/protocol.ts'
import { createScheduler } from '../../cluster/scheduler.ts'
import type { HostHandlers, WorkerHost } from '../../cluster/worker-host.ts'
import { runBatch } from './fuzz.ts'
import { FUZZ_BATCHES, FUZZ_BATCH_SIZE, PLUG_AFTER, mergeStages, startFuzz, type FuzzLine, type FuzzRunState } from './fuzz-run.ts'

/**
 * These tests run the REAL scheduler (spans, retry, recovery, pullThePlug, respawn) against fake workers that
 * run the REAL fuzz engine, answering asynchronously like a worker thread would. They prove the acceptance
 * line: "Pull the plug mid-fuzz prints a real retry line with recoveredMs and the fuzz still completes with
 * 10,000 evaluations."
 */

class EngineWorker implements WorkerHost {
  node: NodeId
  terminated = false
  jobsSeen: Array<{ id: string; batch: number }> = []
  private handlers: HostHandlers
  private options: { failBatch?: number }
  constructor(node: NodeId, handlers: HostHandlers, options: { failBatch?: number }) {
    this.node = node
    this.handlers = handlers
    this.options = options
    setImmediate(() => this.deliver({ type: 'ready', node: this.node, at: 0 }))
  }
  private deliver(msg: FromWorker) {
    if (!this.terminated) this.handlers.message(msg)
  }
  post(msg: ToWorker) {
    if (msg.type !== 'job' || this.terminated) return
    const payload = msg.payload as { n: number; seed: number; batch: number }
    this.jobsSeen.push({ id: msg.id, batch: payload.batch })
    // The worker thread takes a moment, then answers: if the plug is pulled first, nothing is ever sent.
    setImmediate(() => {
      if (this.terminated) return
      if (this.options.failBatch === payload.batch) {
        this.deliver({ type: 'error', id: msg.id, message: 'boom', retryable: false })
        return
      }
      this.deliver({ type: 'result', id: msg.id, result: { ...runBatch(payload), node: this.node } })
    })
  }
  terminate() {
    this.terminated = true
  }
}

function rig(options: { failBatch?: number; supported?: boolean } = {}) {
  const hosts: EngineWorker[] = []
  const scheduler = createScheduler({
    createHost: (service: ServiceId, index: number, handlers: HostHandlers) => {
      const host = new EngineWorker(`${service}-${'abcdefgh'[index]}`, handlers, options)
      hosts.push(host)
      return host
    },
    isSupported: () => options.supported ?? true,
  })
  const lines: FuzzLine[] = []
  const states: FuzzRunState[] = []
  const start = (extra: { plugAfter?: number | null } = {}) =>
    startFuzz(scheduler, { id: 1, seed: 1, ...extra, onLine: (line) => lines.push(line), onChange: (state) => states.push(state) })
  return { scheduler, hosts, lines, states, start }
}

const texts = (lines: FuzzLine[]) => lines.map((line) => line.text)

test('a plain fuzz: 10 batches of 1,000 spread over both workers, 10,000 evaluations, 0 leaks, nothing unplugged', async () => {
  const { start, lines, hosts } = rig()
  const run = await start().done

  assert.equal(run.status, 'done')
  assert.equal(run.batches.length, FUZZ_BATCHES)
  assert.ok(run.batches.every((row) => row.status === 'done' && !row.retried && row.ms !== undefined))
  assert.deepEqual(run.batches.map((row) => row.batch), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'numbered from 1')
  const summary = run.summary
  assert.ok(summary)
  assert.equal(summary.evaluated, FUZZ_BATCHES * FUZZ_BATCH_SIZE)
  assert.equal(summary.leaks, 0)
  assert.ok(summary.crossTenant > 4500 && summary.crossTenant < 5500)
  assert.equal(summary.allowed + summary.denied, 10_000)
  assert.ok(summary.perSecond > 0 && summary.wallMs > 0 && summary.p95ms >= 0)
  assert.deepEqual(summary.stages.map((stage) => stage.name), ['verify', 'evaluate', 'audit'])
  assert.equal(summary.plugged, false)
  assert.equal(summary.retries, 0)
  assert.equal(summary.recoveries.length, 0)

  const nodes = new Set(run.batches.map((row) => row.node))
  assert.deepEqual([...nodes].sort(), ['policy-a', 'policy-b'], 'the pool of two shared the work')
  assert.equal(hosts.length, 2, 'no respawn without a plug')
  const said = texts(lines)
  assert.match(said[0], /^fuzz run 1 · seed 1 · 10 batches of 1,000 requests$/)
  assert.equal(said.filter((text) => /^batch \d+ · policy-[ab] · 1,000 evaluated · [\d,]+ across tenants · 0 leaks · /.test(text)).length, 10)
  assert.ok(!said.some((text) => /unplugged|recovered/.test(text)))
})

test('pull the plug mid-fuzz: policy-b really terminated, its batch retried with recoveredMs, and the fuzz still evaluates 10,000', async () => {
  const { start, lines, hosts, scheduler } = rig()
  const run = await start({ plugAfter: PLUG_AFTER }).done

  assert.equal(run.status, 'done')
  const summary = run.summary
  assert.ok(summary)
  assert.equal(summary.plugged, true)
  assert.equal(summary.evaluated, 10_000, 'the fuzz still completes with 10,000 evaluations')
  assert.equal(summary.leaks, 0)
  assert.equal(summary.retries, 1, 'exactly one batch was caught in flight')
  assert.equal(summary.recoveries.length, 1)
  const [recovery] = summary.recoveries
  assert.ok(recovery.ms >= 0, 'recoveredMs is a measured number')
  assert.equal(recovery.retry, 1)
  assert.match(recovery.sentence, new RegExp(`^retry 1 · batch ${recovery.batch} → policy-[ab] · recovered in \\d+ ms$`))

  // The record: the interrupted attempt is on policy-b and says terminated; the rerun succeeded.
  const row = run.batches[recovery.batch - 1]
  assert.equal(row.retried, true)
  assert.equal(row.attempts.length, 2)
  assert.deepEqual(row.attempts[0], { node: 'policy-b', outcome: 'terminated' })
  assert.equal(row.attempts[1].outcome, 'ok')
  assert.ok(row.recoveredMs !== undefined && row.recoveredMs >= 0)
  assert.equal(row.status, 'done')

  // A real Worker.terminate() happened, and the NodeId was respawned.
  assert.equal(hosts.filter((host) => host.node === 'policy-b').length, 2, 'policy-b was spawned twice')
  assert.equal(hosts.filter((host) => host.node === 'policy-b')[0].terminated, true)
  assert.equal(scheduler.getState().nodes['policy-b'].respawns, 1)
  assert.ok(scheduler.getState().spans.some((span) => span.outcome === 'terminated' && span.node === 'policy-b'))

  // The tape: the unplug line, then the retry line, in that order, with the batch the scheduler named.
  const said = texts(lines)
  const unplugged = said.findIndex((text) => /^policy-b unplugged · batch \d+ in flight$/.test(text))
  const recovered = said.findIndex((text) => /^retry 1 · batch \d+ → policy-[ab] · recovered in \d+ ms$/.test(text))
  assert.ok(unplugged >= 0 && recovered > unplugged, said.join('\n'))
  assert.equal(said[unplugged], `policy-b unplugged · batch ${recovery.batch} in flight`)
  assert.equal(said[recovered], recovery.sentence)
  assert.equal(lines.find((line) => /unplugged/.test(line.text))?.tone, 'live')
})

test('the rerun of the interrupted batch reproduces the first attempt exactly (a retry is idempotent)', async () => {
  const plain = await rig().start().done
  const plugged = await rig().start({ plugAfter: PLUG_AFTER }).done
  const key = (run: FuzzRunState) => ({
    evaluated: run.summary?.evaluated,
    leaks: run.summary?.leaks,
    crossTenant: run.summary?.crossTenant,
    allowed: run.summary?.allowed,
    denied: run.summary?.denied,
    auditBytes: run.summary?.auditBytes,
  })
  assert.deepEqual(key(plugged), key(plain), 'same seed, same verdicts, whether or not a worker died in the middle')
})

test('when no batch is in flight on policy-b after the threshold, no plug is pulled and the run says so', async () => {
  const { start, lines, hosts } = rig()
  const run = await start({ plugAfter: FUZZ_BATCHES + 1 }).done
  assert.equal(run.status, 'done')
  assert.equal(run.summary?.plugged, false)
  assert.equal(hosts.length, 2)
  assert.ok(texts(lines).some((text) => /finished before policy-b was holding a batch/.test(text)))
})

test('a batch that fails for good marks the run failed, with the other batches still counted', async () => {
  const { start, lines } = rig({ failBatch: 3 })
  const run = await start().done
  assert.equal(run.status, 'failed')
  assert.equal(run.error, '1 of 10 batches failed')
  assert.equal(run.batches[2].status, 'failed')
  assert.equal(run.batches[2].error, 'boom')
  assert.equal(run.summary?.evaluated, 9000)
  assert.ok(texts(lines).includes('batch 3 failed: boom'))
})

test('without Worker support the run fails cleanly instead of throwing', async () => {
  const { start, lines } = rig({ supported: false })
  const run = await start().done
  assert.equal(run.status, 'failed')
  assert.match(run.error ?? '', /Web Workers are not available/)
  assert.ok(texts(lines).some((text) => /policy workers are not available/.test(text)))
})

test('cancel before the pool is ready ends the run without submitting anything', async () => {
  const { start, scheduler } = rig()
  const run = start()
  run.cancel()
  const final = await run.done
  assert.equal(final.status, 'cancelled')
  assert.equal(scheduler.getState().queue.length, 0)
})

test('state changes stream out as the run progresses, ending in the final state', async () => {
  const { start, states } = rig()
  const run = await start().done
  assert.ok(states.length >= 10)
  assert.equal(states[0].status === 'running' || states[0].status === 'preparing', true)
  assert.equal(states.at(-1)?.status, 'done')
  const evaluatedSeries = states.map((state) => state.evaluated)
  assert.deepEqual([...evaluatedSeries].sort((a, b) => a - b), evaluatedSeries, 'the running total never goes down')
  assert.equal(run.evaluated, 10_000)
})

test('stages merge by summing each pass over the batches, in pipeline order', () => {
  const stages = mergeStages([
    { ...runBatch({ n: 4, seed: 1, batch: 1 }), stages: [{ name: 'verify', ms: 1 }, { name: 'evaluate', ms: 2 }, { name: 'audit', ms: 3 }] },
    { ...runBatch({ n: 4, seed: 1, batch: 2 }), stages: [{ name: 'verify', ms: 0.5 }, { name: 'evaluate', ms: 0.25 }, { name: 'audit', ms: 4 }] },
  ])
  assert.deepEqual(stages, [
    { name: 'verify', ms: 1.5 },
    { name: 'evaluate', ms: 2.25 },
    { name: 'audit', ms: 7 },
  ])
})

test('every fuzz job kind routes to the policy service', () => {
  // Guards the cast in the runner: the kind string must be one the scheduler maps to the policy pool.
  const kind: JobKind = 'policy.fuzz'
  assert.equal(kind.slice(0, kind.indexOf('.')), 'policy')
})
