import type { NodeId } from '../../cluster/protocol.ts'
import { nodeIdFor } from '../../cluster/registry.ts'
import type { ClusterSpan, ClusterState, Scheduler } from '../../cluster/scheduler.ts'

/**
 * Experiment 1, "Pull the plug": run a real fuzz on the two policy workers, terminate one of them while
 * it is in the middle of a batch, and let the real scheduler reroute the job.
 *
 *   - the fuzz is 10 batches numbered from 1 (the scheduler prints `batch 7` verbatim), the same shape the
 *     policy panel runs, with batches big enough to last tens of milliseconds (see FUZZ_PER_BATCH)
 *   - once two batches have finished, one of OUR batches that is running on policy-b is given a few
 *     milliseconds to be really running, and the plug is pulled on it: what dies is a real job in flight,
 *     and the run records how long it had been dispatched when it was cut off
 *   - nothing is hard-coded: the batches, the retry, the recovery time and the respawn time all come from
 *     the scheduler's spans and the nodes' ready timestamps. If the plug could not be pulled mid-job, or
 *     the workers failed, the run ends with an honest error and proves nothing.
 *
 * Plain `.ts` with injected dependencies (scheduler, clock, timers), so `node --test` drives the real
 * scheduler with fake workers.
 */

export const FUZZ_BATCHES = 10
/**
 * Evaluations per batch. A warm worker runs 1,000 evaluations in about 2 ms, which is shorter than a
 * timer can aim at, so there would be no "middle of a job" to cut. At 20,000 a batch takes tens of
 * milliseconds on a fast laptop, so a plug pulled a few milliseconds after dispatch really lands inside
 * a running batch. The total shown to the visitor is what the workers report, never this constant.
 */
export const FUZZ_PER_BATCH = 20_000
/** Batches that must finish before the plug is pulled, so the visitor has seen work flowing first. */
export const PLUG_AFTER_DONE = 2
/**
 * Once a batch of ours is running on policy-b, wait this long before pulling the plug on it: long enough that
 * the worker has certainly started (a message hop takes a fraction of a millisecond), short enough that a
 * batch (tens of milliseconds at FUZZ_PER_BATCH) is still running. If it finished first, aim at the next one.
 */
export const PLUG_DELAY_MS = 8
export const PLUG_NODE_INDEX = 1
/** After a run proves the hardware is too quick for the batch size, the next one is this many times bigger, up to MAX_BATCH_SCALE. */
export const BATCH_SCALE_STEP = 4
export const MAX_BATCH_SCALE = 64
/** Give up waiting for the respawned node after this long and say so. */
export const RESPAWN_WAIT_MS = 8000
/** The pool should be ready within a moment; if a node never starts, end the run honestly instead of hanging. */
export const ENSURE_TIMEOUT_MS = 12_000

export type BatchState = 'queued' | 'retrying' | 'running' | 'done' | 'retried' | 'failed'

export interface BatchCell {
  batch: number
  state: BatchState
  /** Where it ran (or is running). */
  node: NodeId | null
  /** Duration of the successful attempt. */
  ms: number | null
  /** Dispatches so far (2 or more means it was retried). */
  attempts: number
}

export interface FuzzJob {
  id: string
  batch: number
}

export interface Recovery {
  jobId: string
  batch: number
  /** Where the retry succeeded: the sibling, or the respawned node itself. */
  node: NodeId
  retry: number
  ms: number
}

export interface PlugRun {
  mode: 'plug' | 'fuzz'
  phase: 'starting' | 'running' | 'recovering' | 'done' | 'error'
  startedAt: number
  jobs: FuzzJob[]
  batches: BatchCell[]
  /** `inFlightMs`: how long the batch had been dispatched to the worker when it was cut off. */
  killed: { node: NodeId; batch: number | null; at: number; inFlightMs: number | null } | null
  recovery: Recovery | null
  /** From the pull to the respawned node posting `ready`. */
  respawnMs: number | null
  totals: { evaluated: number; leaks: number } | null
  /** This run's spans, copied so the chart still has them after the scheduler's ring moves on. */
  spans: ClusterSpan[]
  error: string | null
  /** Set when the run ended because every batch finished before the plug could be pulled mid-batch (the hardware is quick). */
  tooQuick?: boolean
}

export interface PlugDeps {
  scheduler: Pick<Scheduler, 'ensureService' | 'submit' | 'pullThePlug' | 'getState' | 'subscribe'>
  now: () => number
  random: () => number
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
}

export interface PlugSink {
  update(run: PlugRun): void
  log(text: string, tone?: 'ink' | 'muted' | 'live' | 'cobalt'): void
}

export interface PlugOptions {
  mode: 'plug' | 'fuzz'
  batches?: number
  perBatch?: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message || error.name : typeof error === 'string' ? error : 'unknown error'
}

/**
 * The batch-size multiplier for the next run. A run that ended because every batch finished before the plug
 * could be pulled mid-batch (`tooQuick`) multiplies it, so a quick machine gets bigger batches on "Run it
 * again"; any other run leaves it alone. The totals printed are always what the workers reported.
 */
export function nextBatchScale(scale: number, run: Pick<PlugRun, 'tooQuick'>): number {
  return run.tooQuick === true ? Math.min(scale * BATCH_SCALE_STEP, MAX_BATCH_SCALE) : scale
}

/**
 * Wrap an async task so that while one run is in flight, calling it again (with any arguments) returns that
 * same run instead of starting another. A fast double click, or the lab's button and the /experiments/
 * buttons pressed together, then share one real run: a second concurrent run (a plain fuzz and a plug run
 * included) would fight the first over the two policy workers.
 */
export function singleFlight<A extends unknown[], T>(task: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
  let current: Promise<T> | null = null
  return (...args) => {
    if (current === null) {
      const started = task(...args)
      current = started
      const release = () => {
        if (current === started) current = null
      }
      started.then(release, release)
    }
    return current
  }
}

/** One cell per batch, derived from the scheduler's queue and spans: no bookkeeping of its own to drift. */
export function deriveBatches(jobs: readonly FuzzJob[], state: Pick<ClusterState, 'queue' | 'spans'>): BatchCell[] {
  return jobs.map(({ id, batch }): BatchCell => {
    const live = state.queue.find((entry) => entry.id === id)
    const spans = state.spans.filter((span) => span.id === id)
    if (live) {
      const state_: BatchState = live.node ? 'running' : live.attempts > 0 ? 'retrying' : 'queued'
      return { batch, state: state_, node: live.node ?? null, ms: null, attempts: live.attempts }
    }
    const ok = [...spans].reverse().find((span) => span.outcome === 'ok')
    if (ok) {
      return {
        batch,
        state: ok.attempts > 1 ? 'retried' : 'done',
        node: ok.node,
        ms: ok.end === undefined ? null : round1(ok.end - ok.start),
        attempts: ok.attempts,
      }
    }
    return { batch, state: 'failed', node: null, ms: null, attempts: spans.length }
  })
}

/** The first job of the run that succeeded after a failure, straight from the scheduler's spans. */
export function findRecovery(jobs: readonly FuzzJob[], spans: readonly ClusterSpan[]): Recovery | null {
  const batchOf = new Map(jobs.map((job) => [job.id, job.batch]))
  for (const span of spans) {
    const batch = batchOf.get(span.id)
    if (batch !== undefined && span.outcome === 'ok' && span.recoveredMs !== undefined) {
      return { jobId: span.id, batch, node: span.node, retry: span.attempts - 1, ms: span.recoveredMs }
    }
  }
  return null
}

/** Pure: is a fuzz batch of ours running on `node` right now? Returns its job. */
export function runningOn(jobs: readonly FuzzJob[], state: Pick<ClusterState, 'queue'>, node: NodeId): FuzzJob | null {
  const entry = state.queue.find((item) => item.node === node && jobs.some((job) => job.id === item.id))
  return entry ? (jobs.find((job) => job.id === entry.id) ?? null) : null
}

function waitForRespawn(deps: PlugDeps, node: NodeId, since: number): Promise<number | null> {
  return new Promise((resolve) => {
    // One object, because `finish` needs the handles that are only known after it is defined.
    const handles: { release: (() => void) | null; timer: unknown } = { release: null, timer: undefined }
    let finished = false
    const finish = (value: number | null) => {
      if (finished) return
      finished = true
      handles.release?.()
      deps.clearTimer(handles.timer)
      resolve(value)
    }
    const check = () => {
      const entry = deps.scheduler.getState().nodes[node]
      if (entry && (entry.status === 'ready' || entry.status === 'busy') && entry.readyAt !== undefined && entry.readyAt >= since) {
        finish(round1(entry.readyAt - since))
      }
    }
    handles.release = deps.scheduler.subscribe(check)
    handles.timer = deps.setTimer(() => finish(null), RESPAWN_WAIT_MS)
    check()
  })
}

const grouped = (n: number) => n.toLocaleString('en-US')

function withTimeout<T>(deps: PlugDeps, promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = deps.setTimer(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        deps.clearTimer(timer)
        resolve(value)
      },
      (error: unknown) => {
        deps.clearTimer(timer)
        reject(error)
      },
    )
  })
}

export async function runPlug(deps: PlugDeps, sink: PlugSink, options: PlugOptions): Promise<PlugRun> {
  const { scheduler } = deps
  const mode = options.mode
  const batchCount = options.batches ?? FUZZ_BATCHES
  const perBatch = options.perBatch ?? FUZZ_PER_BATCH
  const target = nodeIdFor('policy', PLUG_NODE_INDEX)

  let run: PlugRun = {
    mode,
    phase: 'starting',
    startedAt: deps.now(),
    jobs: [],
    batches: [],
    killed: null,
    recovery: null,
    respawnMs: null,
    totals: null,
    spans: [],
    error: null,
  }
  const emit = (patch: Partial<PlugRun>) => {
    run = { ...run, ...patch }
    sink.update(run)
  }
  const fail = (error: string) => {
    sink.log(error, 'live')
    emit({ phase: 'error', error })
    return run
  }
  emit({})

  try {
    await withTimeout(deps, scheduler.ensureService('policy'), ENSURE_TIMEOUT_MS, 'the workers did not start in time')
  } catch (error) {
    return fail(`The policy workers are not available: ${messageOf(error)}`)
  }

  const seed = Math.floor(deps.random() * 0x100000000) >>> 0
  const handles = Array.from({ length: batchCount }, (_, index) =>
    scheduler.submit('policy.fuzz', { n: perBatch, seed: (seed + index + 1) >>> 0, batch: index + 1 }),
  )
  const jobs: FuzzJob[] = handles.map((handle, index) => ({ id: handle.id, batch: index + 1 }))
  const ids = new Set(jobs.map((job) => job.id))
  sink.log(`fuzz started · ${batchCount} batches × ${grouped(perBatch)} evaluations · seed ${seed}`, 'muted')

  // A box, not `let`s: the scheduler callbacks below assign these, and TypeScript cannot see that from here.
  const box: { killed: PlugRun['killed']; armed: { id: string; timer: unknown } | null; finished: boolean } = {
    killed: null,
    armed: null,
    finished: false,
  }
  const mine = (state: ClusterState) => state.spans.filter((span) => ids.has(span.id)).map((span) => ({ ...span }))

  const publish = () => {
    const state = scheduler.getState()
    const batches = deriveBatches(jobs, state)
    const inFlight = batches.some((cell) => cell.state === 'running' || cell.state === 'retrying' || cell.state === 'queued')
    emit({ batches, killed: box.killed, spans: mine(state), phase: box.killed !== null && inFlight ? 'recovering' : 'running' })
  }

  /** The delayed half of the plug: still the same batch, still running on the target? Then cut it. */
  const pull = (id: string) => {
    box.armed = null
    if (box.finished || box.killed !== null) return
    const state = scheduler.getState()
    const victim = runningOn(jobs, state, target)
    if (!victim || victim.id !== id) {
      observe() // it finished first: aim at the next one
      return
    }
    const at = deps.now()
    const open = state.spans.find((span) => span.id === id && span.end === undefined)
    const pulled = scheduler.pullThePlug('policy', PLUG_NODE_INDEX)
    box.killed = { node: pulled.node, batch: victim.batch, at, inFlightMs: open ? round1(at - open.start) : null }
    publish()
  }

  function observe() {
    const state = scheduler.getState()
    if (mode === 'plug' && box.killed === null && !box.finished) {
      const finished = deriveBatches(jobs, state).filter((cell) => cell.state === 'done' || cell.state === 'retried').length
      const victim = runningOn(jobs, state, target)
      if (finished >= PLUG_AFTER_DONE && victim && box.armed?.id !== victim.id) {
        if (box.armed) deps.clearTimer(box.armed.timer)
        box.armed = { id: victim.id, timer: deps.setTimer(() => pull(victim.id), PLUG_DELAY_MS) }
      }
    }
    publish()
  }
  emit({ jobs })
  const release = scheduler.subscribe(observe)
  observe()

  const settled = await Promise.allSettled(handles.map((handle) => handle.promise))
  release()
  box.finished = true
  if (box.armed) deps.clearTimer(box.armed.timer)

  const rejected = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  const finalState = scheduler.getState()
  const batches = deriveBatches(jobs, finalState)
  const killed = box.killed
  if (rejected) {
    emit({ batches, killed, spans: mine(finalState) })
    return fail(`The fuzz did not finish: ${messageOf(rejected.reason)}`)
  }
  if (mode === 'plug' && killed === null) {
    emit({ batches, spans: mine(finalState), tooQuick: true })
    return fail('The fuzz finished before the plug could be pulled mid-batch, so nothing was proved. Run it again.')
  }

  const spans = mine(finalState)
  const recovery = findRecovery(jobs, spans)
  let respawnMs: number | null = null
  if (killed !== null) respawnMs = await waitForRespawn(deps, killed.node, killed.at)

  const totals = settled.reduce(
    (sum, result) => {
      if (result.status !== 'fulfilled') return sum
      return { evaluated: sum.evaluated + result.value.evaluated, leaks: sum.leaks + result.value.leaks }
    },
    { evaluated: 0, leaks: 0 },
  )
  if (mode === 'plug' && recovery === null) {
    emit({ batches, spans, killed, totals })
    return fail('The plug was pulled but no batch had to be retried, so no failover was observed. Run it again.')
  }

  const respawnText = killed !== null && respawnMs !== null ? ` · ${killed.node} back in ${Math.round(respawnMs)} ms` : ''
  sink.log(`fuzz finished · ${grouped(totals.evaluated)} evaluations · ${totals.leaks} leaks${respawnText}`, 'cobalt')
  emit({ phase: 'done', batches: deriveBatches(jobs, scheduler.getState()), spans: mine(scheduler.getState()), recovery, respawnMs, totals, killed })
  return run
}
