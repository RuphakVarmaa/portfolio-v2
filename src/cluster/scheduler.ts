import type { FromWorker, JobKind, JobPayload, JobResult, NodeId, ServiceId, ToWorker } from './protocol.ts'
import { CONCURRENCY, POOL_SIZE, SERVICE_IDS, nodeIdFor, serviceOfKind } from './registry.ts'
import { telemetry } from './telemetry.ts'
import { createWorker, type DeadReason, type HostFactory, type WorkerHost } from './worker-host.ts'

/**
 * The control plane: a real scheduler on the main thread.
 *
 *  - one FIFO queue per service; a job runs on the first node of its service that has capacity
 *  - a failed attempt (retryable error, terminated node, timeout, crash) is requeued with attempts+1,
 *    at the FRONT of its queue so recovery is not stuck behind fresh work, up to `maxAttempts`
 *  - `pullThePlug` really calls `Worker.terminate()`; the NodeId is respawned and stays `dead` until
 *    the new worker posts `ready`
 *  - spans (one per dispatch attempt) record what happened, with `recoveredMs` on the attempt that
 *    finally succeeded after a failure
 *
 * `scheduler` (bottom of the file) is the singleton the site uses. `createScheduler` builds isolated
 * instances with injected workers, clock and timers, which is how the unit tests prove the behaviour.
 */

export interface JobHandle<K extends JobKind> {
  id: string
  kind: K
  /** Settles when the job finishes, fails for good, or is cancelled (rejects with an `AbortError`). */
  promise: Promise<JobResult[K]>
  /** Drop the job: removed from the queue, or the running worker is told to `cancel`. */
  cancel(): void
}

export interface SubmitOptions {
  onProgress?: (p: Extract<FromWorker, { type: 'progress' }>) => void
  /** Per-attempt timeout. When it fires the node is terminated (the only way to stop a worker) and the job retried. */
  timeoutMs?: number
  /**
   * Transferred to the worker with the job. A transferred payload is consumed by the first attempt,
   * so a job submitted with `transfer` is never retried.
   */
  transfer?: Transferable[]
  /** Total attempts including the first. Default 3. */
  maxAttempts?: number
}

export interface ClusterNodeState {
  service: ServiceId
  status: 'spawning' | 'ready' | 'busy' | 'dead'
  /** `performance.now()` when this NodeId was last spawned. */
  spawnedAt: number
  /** `performance.now()` when it last posted `ready`; undefined while spawning or dead. */
  readyAt?: number
  /** Jobs this NodeId has completed successfully this session (kept across respawns). */
  jobs: number
  /** Jobs running on it right now. */
  inFlight: number
  /** How many times this NodeId has been respawned. */
  respawns: number
  /** Round-trip of the last ping (ms); only measured while the board is visible. */
  rttMs?: number
}

export interface ClusterSpan {
  id: string
  kind: JobKind
  node: NodeId
  start: number
  end?: number
  /** 1 for the first dispatch, 2 for the first retry, ... */
  attempts: number
  outcome?: 'ok' | 'error' | 'terminated' | 'timeout'
  /** On the attempt that succeeded after a failure: ms from the failure to this result. */
  recoveredMs?: number
}

export interface ClusterRecovery {
  jobId: string
  kind: JobKind
  node: NodeId
  /** Retries it took: 1 means the second attempt succeeded. */
  retry: number
  ms: number
  /** The sentence printed on tapes, e.g. "retry 1 · batch 7 → policy-a · recovered in 38 ms". */
  sentence: string
}

export interface ClusterState {
  nodes: Record<NodeId, ClusterNodeState>
  /** Queued jobs (no `node`) and running jobs (with `node`), oldest first. */
  queue: Array<{ id: string; kind: JobKind; attempts: number; node?: NodeId }>
  /** The last 200 dispatch attempts, oldest first. */
  spans: ClusterSpan[]
  /** Human sentence for the most recent notable event; printed on tapes and announced. */
  lastEvent?: string
  /** Set when a job succeeded after a failure (the proof that failover worked). */
  recovery?: ClusterRecovery
}

export interface Scheduler {
  /** Spawn the service's pool if needed. Resolves when every node of the pool is ready; rejects if workers are unavailable. */
  ensureService(service: ServiceId): Promise<void>
  submit<K extends JobKind>(kind: K, payload: JobPayload[K], opts?: SubmitOptions): JobHandle<K>
  /** Terminate a real worker. In-flight jobs are requeued; the node is respawned. Defaults to the busiest node, else the last one. */
  pullThePlug(service: ServiceId, index?: number): { node: NodeId; inFlight: string[] }
  getState(): ClusterState
  /** For `useSyncExternalStore`. Notifications are coalesced to one per microtask. */
  subscribe(listener: () => void): () => void
  /** Every protocol message except ping/pong, in both directions. Drives the relay, cable pulses and audio. */
  onMessage(
    listener: (dir: 'in' | 'out', service: ServiceId, msg: ToWorker | FromWorker, node: NodeId) => void,
  ): () => void
  /** False when `Worker` does not exist (very old browser, or the server). */
  isSupported(): boolean
}

export interface SchedulerDeps {
  createHost: HostFactory
  now: () => number
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
  isSupported: () => boolean
  onSpawn?: (node: NodeId, at: number) => void
  onReady?: (node: NodeId, at: number) => void
}

export const DEFAULT_MAX_ATTEMPTS = 3
export const MAX_SPANS = 200
/** A node that crashes on its own (not unplugged) is respawned at most this many times. */
export const MAX_AUTO_RESPAWNS = 3

export const EMPTY_CLUSTER_STATE: ClusterState = Object.freeze({ nodes: {}, queue: [], spans: [] })

type Outcome = NonNullable<ClusterSpan['outcome']>

interface JobRec {
  id: string
  kind: JobKind
  service: ServiceId
  payload: unknown
  opts: SubmitOptions
  maxAttempts: number
  attempts: number
  state: 'queued' | 'running' | 'done'
  node?: NodeId
  span?: SpanRec
  failedAt?: number
  timer?: unknown
  resolve: (value: never) => void
  reject: (reason: unknown) => void
}

/** The mutable master copy of a span; exposed spans are copied per snapshot. */
type SpanRec = ClusterSpan

interface NodeRec {
  id: NodeId
  service: ServiceId
  index: number
  host: WorkerHost | null
  status: ClusterNodeState['status']
  spawnedAt: number
  readyAt?: number
  jobsDone: number
  respawns: number
  autoRespawns: number
  rttMs?: number
  inFlight: Map<string, JobRec>
  /** Bumped whenever the host is replaced so late callbacks from an old worker are ignored. */
  gen: number
  /** Dead for good (handshake timeout or crash loop): not respawned. */
  gone: boolean
}

interface Waiter {
  resolve: () => void
  reject: (error: Error) => void
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function jobLabel(kind: JobKind, payload: unknown): string {
  const batch = (payload as { batch?: unknown } | null)?.batch
  return typeof batch === 'number' ? `batch ${batch}` : kind
}

function abortError(): Error {
  const error = new Error('Job cancelled')
  error.name = 'AbortError'
  return error
}

function shallowEqual(a: object, b: object): boolean {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const key of ka) {
    if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) return false
  }
  return true
}

/** Reuse previous element objects (and the previous array) when nothing changed, so selectors stay stable. */
function shareArray<T extends object>(previous: readonly T[], next: T[]): T[] {
  let same = previous.length === next.length
  for (let i = 0; i < next.length; i++) {
    const prev = previous[i]
    if (prev && shallowEqual(prev, next[i])) next[i] = prev
    else same = false
  }
  return same ? (previous as T[]) : next
}

export function createScheduler(overrides: Partial<SchedulerDeps> = {}): Scheduler {
  const deps: SchedulerDeps = {
    createHost: (service, index, handlers) =>
      createWorker(service, index, handlers, { isBoardVisible: () => telemetry.isBoardVisible() }),
    now: () => performance.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    isSupported: () => typeof Worker !== 'undefined',
    ...overrides,
  }

  const nodes = new Map<NodeId, NodeRec>()
  const queues = new Map<ServiceId, JobRec[]>(SERVICE_IDS.map((service) => [service, []]))
  const waiters = new Map<ServiceId, Waiter[]>(SERVICE_IDS.map((service) => [service, []]))
  const spans: SpanRec[] = []
  const listeners = new Set<() => void>()
  const messageListeners = new Set<(dir: 'in' | 'out', service: ServiceId, msg: ToWorker | FromWorker, node: NodeId) => void>()
  let seq = 0
  let lastEvent: string | undefined
  let recovery: ClusterRecovery | undefined
  let cached: ClusterState = EMPTY_CLUSTER_STATE
  let dirty = true
  let notifyScheduled = false

  // ---- state snapshots --------------------------------------------------------------------------

  function build(previous: ClusterState): ClusterState {
    const nextNodes: Record<NodeId, ClusterNodeState> = {}
    let nodesSame = true
    for (const rec of nodes.values()) {
      const next: ClusterNodeState = {
        service: rec.service,
        status: rec.status,
        spawnedAt: rec.spawnedAt,
        jobs: rec.jobsDone,
        inFlight: rec.inFlight.size,
        respawns: rec.respawns,
      }
      if (rec.readyAt !== undefined) next.readyAt = rec.readyAt
      if (rec.rttMs !== undefined) next.rttMs = rec.rttMs
      const prev = previous.nodes[rec.id]
      if (prev && shallowEqual(prev, next)) nextNodes[rec.id] = prev
      else {
        nextNodes[rec.id] = next
        nodesSame = false
      }
    }
    if (Object.keys(previous.nodes).length !== Object.keys(nextNodes).length) nodesSame = false

    const queued: ClusterState['queue'] = []
    for (const service of SERVICE_IDS) {
      for (const rec of nodes.values()) {
        if (rec.service !== service) continue
        for (const job of rec.inFlight.values()) queued.push({ id: job.id, kind: job.kind, attempts: job.attempts, node: rec.id })
      }
      for (const job of queues.get(service) ?? []) queued.push({ id: job.id, kind: job.kind, attempts: job.attempts })
    }
    const nextSpans: ClusterSpan[] = spans.map((span) => ({ ...span }))

    const state: ClusterState = {
      nodes: nodesSame ? previous.nodes : nextNodes,
      queue: shareArray(previous.queue, queued),
      spans: shareArray(previous.spans, nextSpans),
      lastEvent,
      recovery,
    }
    if (
      state.nodes === previous.nodes &&
      state.queue === previous.queue &&
      state.spans === previous.spans &&
      state.lastEvent === previous.lastEvent &&
      state.recovery === previous.recovery
    ) {
      return previous
    }
    return state
  }

  function getState(): ClusterState {
    if (dirty) {
      cached = build(cached)
      dirty = false
    }
    return cached
  }

  function notify() {
    dirty = true
    if (notifyScheduled) return
    notifyScheduled = true
    queueMicrotask(() => {
      notifyScheduled = false
      for (const listener of [...listeners]) listener()
    })
  }

  function emit(dir: 'in' | 'out', service: ServiceId, msg: ToWorker | FromWorker, node: NodeId) {
    if (msg.type === 'ping' || msg.type === 'pong') return
    for (const listener of [...messageListeners]) listener(dir, service, msg, node)
  }

  // ---- spans ------------------------------------------------------------------------------------

  function openSpan(job: JobRec, node: NodeId): SpanRec {
    const span: SpanRec = { id: job.id, kind: job.kind, node, start: deps.now(), attempts: job.attempts }
    spans.push(span)
    if (spans.length > MAX_SPANS) spans.splice(0, spans.length - MAX_SPANS)
    return span
  }

  function closeSpan(job: JobRec, outcome: Outcome, recoveredMs?: number) {
    const span = job.span
    if (!span || span.end !== undefined) return
    span.end = deps.now()
    span.outcome = outcome
    if (recoveredMs !== undefined) span.recoveredMs = recoveredMs
  }

  // ---- node lifecycle ---------------------------------------------------------------------------

  function poolNodes(service: ServiceId): NodeRec[] {
    return [...nodes.values()].filter((rec) => rec.service === service).sort((a, b) => a.index - b.index)
  }

  function poolReady(service: ServiceId): boolean {
    const pool = poolNodes(service)
    return pool.length === POOL_SIZE[service] && pool.every((rec) => rec.status === 'ready' || rec.status === 'busy')
  }

  function poolFailed(service: ServiceId): boolean {
    const pool = poolNodes(service)
    return pool.length > 0 && pool.every((rec) => rec.gone)
  }

  function settleWaiters(service: ServiceId) {
    const list = waiters.get(service) ?? []
    if (list.length === 0) return
    if (poolReady(service)) {
      waiters.set(service, [])
      for (const waiter of list) waiter.resolve()
    } else if (poolFailed(service)) {
      waiters.set(service, [])
      for (const waiter of list) waiter.reject(new Error(`${service} workers are not available`))
    }
  }

  function rejectQueued(service: ServiceId, reason: string) {
    const queue = queues.get(service) ?? []
    queues.set(service, [])
    for (const job of queue) {
      settle(job)
      job.reject(new Error(reason))
    }
  }

  function spawnNode(rec: NodeRec) {
    const gen = ++rec.gen
    rec.spawnedAt = deps.now()
    rec.readyAt = undefined
    rec.rttMs = undefined
    // A respawn keeps the node `dead` until `ready` (spec 6.5); only the very first spawn is `spawning`.
    if (rec.status !== 'dead') rec.status = 'spawning'
    deps.onSpawn?.(rec.id, rec.spawnedAt)
    const host: WorkerHost = deps.createHost(rec.service, rec.index, {
      message: (msg) => {
        if (rec.gen !== gen) return
        onWorkerMessage(rec, msg)
      },
      dead: (reason, detail) => {
        if (rec.gen !== gen) return
        onWorkerDead(rec, reason, detail)
      },
    })
    // The host may already have reported its own death while it was being created.
    if (rec.gen === gen) rec.host = host
    notify()
  }

  function ensurePool(service: ServiceId) {
    for (let index = 0; index < POOL_SIZE[service]; index++) {
      const id = nodeIdFor(service, index)
      if (nodes.has(id)) continue
      const rec: NodeRec = {
        id,
        service,
        index,
        host: null,
        status: 'spawning',
        spawnedAt: deps.now(),
        jobsDone: 0,
        respawns: 0,
        autoRespawns: 0,
        inFlight: new Map(),
        gen: 0,
        gone: false,
      }
      nodes.set(id, rec)
      spawnNode(rec)
    }
  }

  function onWorkerMessage(rec: NodeRec, msg: FromWorker) {
    emit('in', rec.service, msg, rec.id)
    switch (msg.type) {
      case 'ready': {
        if (rec.status !== 'spawning' && rec.status !== 'dead') return
        rec.status = rec.inFlight.size > 0 ? 'busy' : 'ready'
        rec.readyAt = deps.now()
        deps.onReady?.(rec.id, rec.readyAt)
        notify()
        settleWaiters(rec.service)
        pump(rec.service)
        return
      }
      case 'progress': {
        rec.inFlight.get(msg.id)?.opts.onProgress?.(msg)
        return
      }
      case 'result': {
        const job = rec.inFlight.get(msg.id)
        if (job) finishJob(rec, job, msg.result)
        return
      }
      case 'error': {
        const job = rec.inFlight.get(msg.id)
        if (job) failJob(rec, job, msg.message, msg.retryable)
        return
      }
      case 'pong': {
        rec.rttMs = round1(Math.max(0, deps.now() - msg.at))
        notify()
        return
      }
      case 'log':
        return
    }
  }

  function onWorkerDead(rec: NodeRec, reason: DeadReason, detail?: string) {
    // The host has already terminated the raw worker.
    rec.host = null
    if (reason === 'handshake-timeout') {
      lastEvent = `${rec.id} did not start${detail ? ` (${detail})` : ''}`
      takeDown(rec, { outcome: () => 'error', respawn: false, permanent: true })
    } else {
      const respawn = rec.autoRespawns < MAX_AUTO_RESPAWNS
      rec.autoRespawns += 1
      lastEvent = `${rec.id} crashed${detail ? `: ${detail}` : ''}${respawn ? '; respawning' : '; not respawned'}`
      takeDown(rec, { outcome: () => 'error', respawn, permanent: !respawn })
    }
    notify()
  }

  /**
   * The one place a node goes down. Requeues (or rejects) everything that was running on it, marks it
   * dead, optionally schedules the respawn, and lets siblings pick the work up immediately.
   */
  function takeDown(
    rec: NodeRec,
    options: { outcome: (job: JobRec) => Outcome; respawn: boolean; permanent: boolean; message?: string },
  ) {
    const jobs = [...rec.inFlight.values()]
    rec.inFlight.clear()
    rec.host?.terminate()
    rec.host = null
    rec.gen += 1
    rec.status = 'dead'
    rec.readyAt = undefined
    rec.gone = options.permanent
    for (const job of jobs) {
      attemptFailed(job, options.outcome(job), options.message ?? 'the worker went away', true)
    }
    if (options.respawn && !options.permanent) {
      rec.respawns += 1
      deps.setTimer(() => {
        if (rec.status === 'dead' && !rec.gone && rec.host === null) spawnNode(rec)
      }, 0)
    }
    if (options.permanent && poolFailed(rec.service)) rejectQueued(rec.service, `${rec.service} workers are not available`)
    settleWaiters(rec.service)
    pump(rec.service)
    notify()
  }

  // ---- jobs -------------------------------------------------------------------------------------

  function pump(service: ServiceId) {
    const queue = queues.get(service) ?? []
    const capacity = CONCURRENCY[service]
    while (queue.length > 0) {
      const target = poolNodes(service).find(
        (rec) => (rec.status === 'ready' || rec.status === 'busy') && rec.inFlight.size < capacity,
      )
      if (!target) break
      const job = queue.shift() as JobRec
      startJob(target, job)
    }
  }

  function startJob(rec: NodeRec, job: JobRec) {
    job.attempts += 1
    job.state = 'running'
    job.node = rec.id
    job.span = openSpan(job, rec.id)
    rec.inFlight.set(job.id, job)
    rec.status = 'busy'
    const msg: ToWorker = { type: 'job', id: job.id, kind: job.kind, payload: job.payload }
    emit('out', rec.service, msg, rec.id)
    rec.host?.post(msg, job.opts.transfer)
    if (job.opts.timeoutMs !== undefined) {
      const gen = rec.gen
      job.timer = deps.setTimer(() => {
        if (job.state !== 'running' || rec.gen !== gen) return
        // The only way to stop a worker that is stuck is to terminate it.
        lastEvent = `${rec.id} timed out on ${jobLabel(job.kind, job.payload)}; terminated and respawned`
        takeDown(rec, {
          outcome: (j) => (j === job ? 'timeout' : 'terminated'),
          respawn: true,
          permanent: false,
          message: `timed out after ${job.opts.timeoutMs} ms`,
        })
        notify()
      }, job.opts.timeoutMs)
    }
    notify()
  }

  function releaseSlot(rec: NodeRec, job: JobRec) {
    rec.inFlight.delete(job.id)
    if (job.timer !== undefined) deps.clearTimer(job.timer)
    job.timer = undefined
    if (rec.status === 'busy' && rec.inFlight.size === 0) rec.status = 'ready'
  }

  /** A finished job keeps nothing alive: the caller may hold its handle for a long time. */
  function settle(job: JobRec) {
    job.state = 'done'
    job.payload = undefined
    job.opts = {}
  }

  function finishJob(rec: NodeRec, job: JobRec, result: unknown) {
    releaseSlot(rec, job)
    const label = jobLabel(job.kind, job.payload) // before settle() drops the payload
    settle(job)
    rec.jobsDone += 1
    const now = deps.now()
    if (job.failedAt !== undefined) {
      const ms = round1(now - job.failedAt)
      const retry = job.attempts - 1
      const sentence = `retry ${retry} · ${label} → ${rec.id} · recovered in ${Math.round(ms)} ms`
      closeSpan(job, 'ok', ms)
      lastEvent = sentence
      recovery = { jobId: job.id, kind: job.kind, node: rec.id, retry, ms, sentence }
    } else {
      closeSpan(job, 'ok')
    }
    job.resolve(result as never)
    notify()
    pump(rec.service)
  }

  function failJob(rec: NodeRec, job: JobRec, message: string, retryable: boolean) {
    releaseSlot(rec, job)
    attemptFailed(job, 'error', message, retryable)
    notify()
    pump(rec.service)
  }

  /** Close the attempt's span, then requeue the job (front of the queue) or reject it for good. */
  function attemptFailed(job: JobRec, outcome: Outcome, message: string, retryable: boolean) {
    if (job.timer !== undefined) deps.clearTimer(job.timer)
    job.timer = undefined
    closeSpan(job, outcome)
    const transferred = (job.opts.transfer?.length ?? 0) > 0
    if (retryable && !transferred && job.attempts < job.maxAttempts) {
      job.failedAt ??= deps.now()
      job.state = 'queued'
      job.node = undefined
      queues.get(job.service)?.unshift(job)
      return
    }
    const label = jobLabel(job.kind, job.payload)
    const error = Object.assign(
      new Error(job.attempts > 1 ? `${label} failed after ${job.attempts} attempts: ${message}` : message),
      { attempts: job.attempts, reason: message },
    )
    if (retryable) lastEvent = `${label} failed after ${job.attempts} attempt${job.attempts === 1 ? '' : 's'}: ${message}`
    settle(job)
    job.reject(error)
  }

  function cancelJob(job: JobRec) {
    if (job.state === 'done') return
    if (job.state === 'queued') {
      const queue = queues.get(job.service) ?? []
      const at = queue.indexOf(job)
      if (at >= 0) queue.splice(at, 1)
      settle(job)
      job.reject(abortError())
      notify()
      return
    }
    // Running: tell the worker, free the slot now, ignore whatever it still sends for this id.
    const rec = job.node ? nodes.get(job.node) : undefined
    settle(job)
    if (rec) {
      const msg: ToWorker = { type: 'cancel', id: job.id }
      emit('out', rec.service, msg, rec.id)
      rec.host?.post(msg)
      releaseSlot(rec, job)
    }
    closeSpan(job, 'error')
    job.reject(abortError())
    notify()
    if (rec) pump(rec.service)
  }

  // ---- public API -------------------------------------------------------------------------------

  const api: Scheduler = {
    isSupported: () => deps.isSupported(),

    ensureService(service) {
      if (!deps.isSupported()) return Promise.reject(new Error('Web Workers are not available in this browser'))
      ensurePool(service)
      if (poolReady(service)) return Promise.resolve()
      if (poolFailed(service)) return Promise.reject(new Error(`${service} workers are not available`))
      return new Promise<void>((resolve, reject) => {
        waiters.get(service)?.push({ resolve, reject })
      })
    },

    submit<K extends JobKind>(kind: K, payload: JobPayload[K], opts: SubmitOptions = {}): JobHandle<K> {
      const service = serviceOfKind(kind)
      const id = `j${++seq}`
      let rec!: JobRec
      const promise = new Promise<JobResult[K]>((resolve, reject) => {
        rec = {
          id,
          kind,
          service,
          payload,
          opts,
          maxAttempts: Math.max(1, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS),
          attempts: 0,
          state: 'queued',
          resolve: resolve as (value: never) => void,
          reject,
        }
      })
      // Fire-and-forget callers (and cancelled frames) must not trigger unhandled-rejection noise;
      // anyone who awaits `promise` still sees the rejection.
      promise.catch(() => undefined)

      if (!deps.isSupported()) {
        rec.state = 'done'
        rec.reject(new Error('Web Workers are not available in this browser'))
      } else {
        queues.get(service)?.push(rec)
        ensurePool(service)
        if (poolFailed(service)) rejectQueued(service, `${service} workers are not available`)
        else pump(service)
        notify()
      }
      return { id, kind, promise, cancel: () => cancelJob(rec) }
    },

    pullThePlug(service, index) {
      let rec: NodeRec | undefined
      if (index !== undefined) rec = nodes.get(nodeIdFor(service, index))
      else {
        const live = poolNodes(service).filter((candidate) => candidate.host !== null)
        rec = [...live].reverse().find((candidate) => candidate.inFlight.size > 0) ?? live[live.length - 1]
      }
      const node = rec?.id ?? nodeIdFor(service, index ?? 0)
      if (!rec || rec.host === null) return { node, inFlight: [] }
      const jobs = [...rec.inFlight.values()]
      const inFlight = jobs.map((job) => job.id)
      const labels = jobs.map((job) => jobLabel(job.kind, job.payload))
      // Set before taking the node down: a sibling may finish the retried job synchronously, and its
      // "recovered" sentence must be the one that survives.
      lastEvent = `${node} unplugged · ${labels.length === 0 ? 'idle' : `${labels.join(', ')} in flight`}`
      takeDown(rec, { outcome: () => 'terminated', respawn: true, permanent: false, message: 'terminated' })
      notify()
      return { node, inFlight }
    },

    getState,

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    onMessage(listener) {
      messageListeners.add(listener)
      return () => {
        messageListeners.delete(listener)
      }
    },
  }
  return api
}

/** The site's scheduler. Spawns nothing until `ensureService` / `submit` is called. */
export const scheduler: Scheduler = createScheduler({
  onSpawn: (node, at) => telemetry.markWorker(node, 'spawn', at),
  onReady: (node, at) => telemetry.markWorker(node, 'ready', at),
})
