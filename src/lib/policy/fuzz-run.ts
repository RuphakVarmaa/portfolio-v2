import { formatMs } from '../../cluster/format.ts'
import type { JobPayload, Stage } from '../../cluster/protocol.ts'
import type { ClusterSpan, ClusterState, JobHandle, SubmitOptions } from '../../cluster/scheduler.ts'
import { STAGE_NAMES, percentile, type BatchResult } from './fuzz.ts'

/**
 * Runs one cross-tenant fuzz on the policy worker pool (spec 4.5) and reports it as plain data. No React,
 * no DOM: the panel renders `FuzzRunState`, and the tests drive the real scheduler with fake workers.
 *
 *   - 10 jobs of 1,000 requests, numbered from 1 (the scheduler prints `batch 7` verbatim)
 *   - the scheduler spreads them over policy-a and policy-b, one job per node at a time
 *   - "pull the plug": after `plugAfter` batches have finished, and only while policy-b is really holding a
 *     batch, call `scheduler.pullThePlug('policy', 1)`. The scheduler terminates the worker, requeues the
 *     batch with attempts + 1 and the sibling (or the respawned node) runs it; the batch is deterministic, so
 *     the rerun is identical and the fuzz still ends with exactly 10,000 evaluations.
 *
 * Everything shown is measured: counts and timings come from the workers' results, the wall clock and the
 * scheduler's own spans and `recovery` record. Nothing here is a constant.
 */

/** The slice of the scheduler the runner uses; the real `scheduler` satisfies it. */
export interface FuzzScheduler {
  ensureService(service: 'policy'): Promise<void>
  submit(kind: 'policy.fuzz', payload: JobPayload['policy.fuzz'], options?: SubmitOptions): JobHandle<'policy.fuzz'>
  pullThePlug(service: 'policy', index?: number): { node: string; inFlight: string[] }
  getState(): ClusterState
  subscribe(listener: () => void): () => void
}

export const FUZZ_BATCHES = 10
export const FUZZ_BATCH_SIZE = 1000
/** Pull the plug once this many batches have finished (and the second worker is holding one). */
export const PLUG_AFTER = 4

export type BatchStatus = 'queued' | 'running' | 'done' | 'failed'

export interface BatchAttempt {
  node: string
  outcome?: ClusterSpan['outcome']
}

export interface BatchRow {
  /** 1 to 10. */
  batch: number
  jobId: string
  status: BatchStatus
  /** Every dispatch so far, oldest first, from the scheduler's spans. */
  attempts: BatchAttempt[]
  /** The worker that produced the result, or that is running it now. */
  node?: string
  /** The batch's time inside the worker, ms (measured there). */
  ms?: number
  /** An earlier attempt was cut short (terminated, timed out or errored) and the batch was run again. */
  retried: boolean
  /** From the failure to the successful rerun, ms (the scheduler's `recoveredMs`). */
  recoveredMs?: number
  error?: string
}

export interface FuzzLine {
  id: string
  text: string
  tone: 'ink' | 'muted' | 'live' | 'cobalt'
}

export interface FuzzRecovery {
  batch: number
  node: string
  retry: number
  ms: number
  /** The scheduler's sentence, e.g. `retry 1 · batch 6 → policy-a · recovered in 4 ms`. */
  sentence: string
}

export interface FuzzSummary {
  seed: number
  evaluated: number
  leaks: number
  /** Requests whose actor and row were in different tenants. */
  crossTenant: number
  allowed: number
  denied: number
  auditBytes: number
  /** Wall time on the page from the first dispatch to the last result, ms. Includes any recovery. */
  wallMs: number
  perSecond: number
  /** p95 of the ten batch times (each measured inside its worker), ms. */
  p95ms: number
  /** The three pipeline stages summed over every batch of the run, ms. */
  stages: Stage[]
  retries: number
  recoveries: FuzzRecovery[]
  /** Whether the plug was really pulled during this run. */
  plugged: boolean
  /** Epoch milliseconds when the run ended (for a clock label). */
  finishedAt: number
}

export type RunStatus = 'preparing' | 'running' | 'done' | 'failed' | 'cancelled'

export interface FuzzRunState {
  id: number
  seed: number
  /** True when this run was asked to pull the plug. */
  withPlug: boolean
  status: RunStatus
  batches: BatchRow[]
  /** Running totals over the batches finished so far. */
  evaluated: number
  leaks: number
  summary?: FuzzSummary
  error?: string
}

export interface StartOptions {
  id: number
  seed: number
  batches?: number
  batchSize?: number
  /** Pull the plug on policy-b after this many batches have finished. `null`: a plain run. */
  plugAfter?: number | null
  /** Monotonic milliseconds. Default `performance.now`. */
  now?: () => number
  /** Epoch milliseconds. Default `Date.now`. */
  epoch?: () => number
  onChange?: (state: FuzzRunState) => void
  onLine?: (line: FuzzLine) => void
}

export interface FuzzRunHandle {
  getState(): FuzzRunState
  /** Resolves with the final state (`done`, `failed` or `cancelled`); never rejects. */
  done: Promise<FuzzRunState>
  cancel(): void
}

const grouped = (n: number) => n.toLocaleString('en-US')
const round1 = (n: number) => Math.round(n * 10) / 10
const round3 = (n: number) => Math.round(n * 1000) / 1000

/** Sum each pipeline stage over the batches. Names and order are the panel's (`verify`, `evaluate`, `audit`). */
export function mergeStages(results: readonly BatchResult[]): Stage[] {
  return STAGE_NAMES.map((name) => ({
    name,
    ms: round3(results.reduce((sum, result) => sum + (result.stages.find((stage) => stage.name === name)?.ms ?? 0), 0)),
  }))
}

export function startFuzz(scheduler: FuzzScheduler, options: StartOptions): FuzzRunHandle {
  const { id, seed, batches = FUZZ_BATCHES, batchSize = FUZZ_BATCH_SIZE, plugAfter = null } = options
  const now = options.now ?? (() => performance.now())
  const epoch = options.epoch ?? (() => Date.now())

  const rows: BatchRow[] = []
  const handles: Array<JobHandle<'policy.fuzz'>> = []
  const results = new Map<number, BatchResult>()
  const recoveries: FuzzRecovery[] = []
  const seenRecovery = new Set<string>()
  let status: RunStatus = 'preparing'
  let error: string | undefined
  let summary: FuzzSummary | undefined
  let evaluated = 0
  let leaks = 0
  let finishedBatches = 0
  let plugged = false
  let startedAt = 0
  let lineSeq = 0
  let stopListening: (() => void) | undefined

  const snapshot = (): FuzzRunState => ({
    id,
    seed,
    withPlug: plugAfter !== null,
    status,
    batches: rows.map((row) => ({ ...row, attempts: [...row.attempts] })),
    evaluated,
    leaks,
    summary,
    error,
  })
  // A function, so the compiler does not narrow `status` inside the immediately-invoked async body below.
  const wasCancelled = () => status === 'cancelled'
  const emit = () => options.onChange?.(snapshot())
  const say = (text: string, tone: FuzzLine['tone']) => options.onLine?.({ id: `f${id}.${++lineSeq}`, text, tone })

  /** Refresh every row from the scheduler's spans: which node ran each attempt and how it ended. */
  const syncFromSpans = () => {
    const spans = scheduler.getState().spans
    for (const row of rows) {
      const mine = spans.filter((span) => span.id === row.jobId)
      row.attempts = mine.map((span) => ({ node: span.node, outcome: span.outcome }))
      row.retried = mine.some((span) => span.outcome === 'terminated' || span.outcome === 'timeout' || span.outcome === 'error')
      row.recoveredMs = mine.find((span) => span.recoveredMs !== undefined)?.recoveredMs
      const last = mine[mine.length - 1]
      if (row.status === 'queued' || row.status === 'running') {
        row.status = last && last.end === undefined ? 'running' : 'queued'
        row.node = last?.node
      }
    }
  }

  /** Print the scheduler's recovery sentence once, when it is about one of this run's batches. */
  const checkRecovery = () => {
    const recovery = scheduler.getState().recovery
    if (!recovery) return
    const row = rows.find((candidate) => candidate.jobId === recovery.jobId)
    const key = `${recovery.jobId}:${recovery.retry}`
    if (!row || seenRecovery.has(key)) return
    seenRecovery.add(key)
    recoveries.push({ batch: row.batch, node: recovery.node, retry: recovery.retry, ms: recovery.ms, sentence: recovery.sentence })
    say(recovery.sentence, 'live')
  }

  const tryPullThePlug = () => {
    if (plugAfter === null || plugged || finishedBatches < plugAfter) return
    // Only when policy-b really holds a batch right now; otherwise wait for the next finish.
    if ((scheduler.getState().nodes['policy-b']?.inFlight ?? 0) === 0) return
    const { node, inFlight } = scheduler.pullThePlug('policy', 1)
    if (inFlight.length === 0) return
    plugged = true
    const held = inFlight.map((jobId) => rows.find((row) => row.jobId === jobId)?.batch).filter((batch): batch is number => batch !== undefined)
    say(`${node} unplugged · ${held.map((batch) => `batch ${batch}`).join(', ')} in flight`, 'live')
  }

  const onBatchDone = (batch: number, result: BatchResult) => {
    const row = rows[batch - 1]
    results.set(batch, result)
    finishedBatches += 1
    evaluated += result.evaluated
    leaks += result.leaks
    row.status = 'done'
    row.node = result.node ?? row.node
    row.ms = result.totalMs
    syncFromSpans()
    checkRecovery()
    say(
      `batch ${batch} · ${result.node ?? 'worker'} · ${grouped(result.evaluated)} evaluated · ${grouped(result.crossTenant)} across tenants · ${result.leaks} leaks · ${formatMs(result.totalMs)}`,
      result.leaks > 0 ? 'live' : 'ink',
    )
    if (result.sample[0]) say(result.sample[0], result.leaks > 0 ? 'live' : 'muted')
    tryPullThePlug()
    emit()
  }

  const onBatchFailed = (batch: number, failure: unknown) => {
    const row = rows[batch - 1]
    const message = failure instanceof Error ? failure.message : String(failure)
    if (status === 'cancelled' || (failure instanceof Error && failure.name === 'AbortError')) {
      row.status = 'failed'
      row.error = 'cancelled'
      return
    }
    row.status = 'failed'
    row.error = message
    syncFromSpans()
    say(`batch ${batch} failed: ${message}`, 'live')
    emit()
  }

  const finish = (): FuzzRunState => {
    stopListening?.()
    stopListening = undefined
    if (status === 'cancelled') {
      emit()
      return snapshot()
    }
    const failed = rows.filter((row) => row.status === 'failed')
    const finished = [...results.values()]
    const wallMs = round1(Math.max(0.001, now() - startedAt))
    const crossTenant = finished.reduce((sum, result) => sum + result.crossTenant, 0)
    summary = {
      seed,
      evaluated,
      leaks,
      crossTenant,
      allowed: finished.reduce((sum, result) => sum + result.allowed, 0),
      denied: finished.reduce((sum, result) => sum + result.denied, 0),
      auditBytes: finished.reduce((sum, result) => sum + result.auditBytes, 0),
      wallMs,
      perSecond: Math.round(evaluated / (wallMs / 1000)),
      p95ms: round1(percentile(finished.map((result) => result.totalMs), 95)),
      stages: mergeStages(finished),
      retries: rows.filter((row) => row.retried).length,
      recoveries,
      plugged,
      finishedAt: epoch(),
    }
    if (plugAfter !== null && !plugged) {
      say('The run finished before policy-b was holding a batch, so no plug was pulled.', 'muted')
    }
    if (failed.length > 0) {
      status = 'failed'
      error = `${failed.length} of ${batches} batches failed`
    } else {
      status = 'done'
    }
    emit()
    return snapshot()
  }

  const done = (async (): Promise<FuzzRunState> => {
    try {
      await scheduler.ensureService('policy')
    } catch (failure) {
      status = 'failed'
      error = failure instanceof Error ? failure.message : String(failure)
      say(`policy workers are not available: ${error}`, 'live')
      emit()
      return snapshot()
    }
    if (wasCancelled()) return snapshot()

    status = 'running'
    startedAt = now()
    say(`fuzz run ${id} · seed ${seed} · ${batches} batches of ${grouped(batchSize)} requests`, 'muted')
    stopListening = scheduler.subscribe(() => {
      syncFromSpans()
      checkRecovery()
      emit()
    })

    for (let batch = 1; batch <= batches; batch++) {
      const handle = scheduler.submit('policy.fuzz', { n: batchSize, seed, batch })
      handles.push(handle)
      rows.push({ batch, jobId: handle.id, status: 'queued', attempts: [], retried: false })
    }
    syncFromSpans()
    emit()

    await Promise.all(
      handles.map((handle, index) =>
        handle.promise.then(
          (result) => onBatchDone(index + 1, result as BatchResult),
          (failure: unknown) => onBatchFailed(index + 1, failure),
        ),
      ),
    )
    return finish()
  })()

  return {
    getState: snapshot,
    done,
    cancel() {
      if (status === 'done' || status === 'failed' || status === 'cancelled') return
      status = 'cancelled'
      for (const handle of handles) handle.cancel()
    },
  }
}
