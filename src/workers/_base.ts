import type { FromWorker, JobKind, JobPayload, JobResult, NodeId, ToWorker } from '../cluster/protocol.ts'

/**
 * Worker-side plumbing. A section implements only the handlers for its JobKinds; this file wires
 * `message` events, progress reports, cancellation, error classification and the `ready` handshake.
 *
 *   // src/workers/policy.worker.ts
 *   import { defineWorker } from './_base.ts'
 *   defineWorker('policy-a', {
 *     'policy.evaluate': (payload) => evaluate(payload),
 *     'policy.fuzz': async (payload, ctx) => { ctx.progress({ pct: 50 }); return runFuzz(payload) },
 *   })
 */

export interface JobContext {
  readonly id: string
  readonly kind: JobKind
  /** The node this handler is running on (`self.name`), e.g. 'policy-b'. */
  readonly node: NodeId
  /** Aborted when the scheduler sends `cancel` for this job. Long handlers should check it between steps. */
  readonly signal: AbortSignal
  /** Report progress to the main thread (`onProgress` in SubmitOptions). Cheap; call as often as useful. */
  progress(update: { stage?: string; pct?: number; bytesLoaded?: number; bytesTotal?: number }): void
  /** Send a human-readable log line to the main thread. */
  log(text: string, level?: 'info' | 'warn'): void
}

export type Handler<K extends JobKind> = (
  payload: JobPayload[K],
  ctx: JobContext,
) => JobResult[K] | Promise<JobResult[K]>

/** A worker implements any subset of JobKinds (normally the ones that start with its service id). */
export type Handlers = { [K in JobKind]?: Handler<K> }

export interface DefineWorkerOptions {
  /**
   * Runs once before `ready` is posted (load a corpus, warm a table, import a heavy module). The
   * scheduler marks the node `ready` only after this resolves. If it throws, the error is re-thrown
   * outside the promise chain so the main thread sees a worker `error` event and marks the node dead.
   */
  init?: () => void | Promise<void>
}

/**
 * Throw this from a handler to tell the scheduler the job is worth retrying (transient failure).
 * Any other thrown error is final: the job rejects after one attempt.
 */
export class RetryableError extends Error {
  readonly retryable = true
}

/** The subset of DedicatedWorkerGlobalScope this file uses (the DOM lib types `self` as a Window). */
interface WorkerScope {
  readonly name: string
  postMessage(message: FromWorker, transfer?: Transferable[]): void
  addEventListener(type: 'message', listener: (event: MessageEvent<ToWorker>) => void): void
}

function isRetryable(error: unknown): boolean {
  return (
    error instanceof RetryableError ||
    (typeof error === 'object' && error !== null && (error as { retryable?: unknown }).retryable === true)
  )
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  return typeof error === 'string' ? error : 'Unknown error'
}

/** Absolute (epoch) milliseconds, comparable with the main thread's `performance.timeOrigin + performance.now()`. */
function epochNow(): number {
  return performance.timeOrigin + performance.now()
}

/**
 * Wire this worker scope to the cluster protocol.
 * @param node the service's first node id (e.g. 'policy-a'). Pools share one script: the scheduler
 *   names each Worker instance after its node, so `self.name` ('policy-b') wins when it is set.
 */
export function defineWorker<H extends Handlers>(
  node: NodeId,
  handlers: H,
  options: DefineWorkerOptions = {},
): void {
  const scope = self as unknown as WorkerScope
  const nodeId: NodeId = scope.name || node
  const controllers = new Map<string, AbortController>()

  const post = (message: FromWorker, transfer?: Transferable[]) => {
    if (transfer && transfer.length > 0) scope.postMessage(message, transfer)
    else scope.postMessage(message)
  }

  const runJob = async (id: string, kind: JobKind, payload: unknown) => {
    const handler = (handlers as Handlers)[kind] as
      | ((p: unknown, c: JobContext) => unknown | Promise<unknown>)
      | undefined
    if (!handler) {
      post({ type: 'error', id, message: `Worker ${nodeId} has no handler for ${kind}`, retryable: false })
      return
    }
    const controller = new AbortController()
    controllers.set(id, controller)
    const ctx: JobContext = {
      id,
      kind,
      node: nodeId,
      signal: controller.signal,
      progress: (update) => post({ type: 'progress', id, ...update }),
      log: (text, level = 'info') => post({ type: 'log', level, text }),
    }
    try {
      const result = await handler(payload, ctx)
      if (controller.signal.aborted) {
        post({ type: 'error', id, message: 'cancelled', retryable: false })
      } else {
        post({ type: 'result', id, result })
      }
    } catch (error) {
      post({
        type: 'error',
        id,
        message: controller.signal.aborted ? 'cancelled' : messageOf(error),
        retryable: !controller.signal.aborted && isRetryable(error),
      })
    } finally {
      controllers.delete(id)
    }
  }

  scope.addEventListener('message', (event) => {
    const message = event.data
    switch (message.type) {
      case 'job':
        void runJob(message.id, message.kind, message.payload)
        break
      case 'cancel':
        controllers.get(message.id)?.abort()
        break
      case 'ping':
        post({ type: 'pong', at: message.at })
        break
    }
  })

  const announceReady = () => post({ type: 'ready', node: nodeId, at: epochNow() })

  let initResult: void | Promise<void>
  try {
    initResult = options.init?.()
  } catch (error) {
    post({ type: 'log', level: 'warn', text: `init failed: ${messageOf(error)}` })
    setTimeout(() => {
      throw error
    }, 0)
    return
  }
  if (initResult && typeof (initResult as Promise<void>).then === 'function') {
    ;(initResult as Promise<void>).then(announceReady, (error: unknown) => {
      post({ type: 'log', level: 'warn', text: `init failed: ${messageOf(error)}` })
      setTimeout(() => {
        throw error
      }, 0)
    })
  } else {
    announceReady()
  }
}
