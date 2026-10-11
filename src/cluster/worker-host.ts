import type { FromWorker, NodeId, ServiceId, ToWorker } from './protocol.ts'
import { createRawWorker, nodeIdFor } from './registry.ts'

/**
 * Worker host: wraps one raw `Worker` and owns the parts of its life the scheduler should not care
 * about: the handshake (a worker that does not post `ready` within 10 s is declared dead), the
 * ping/pong heartbeat (every 5 s, only while the board is visible) and crash detection.
 *
 * The scheduler talks to a `WorkerHost`, never to a raw `Worker`, which is what lets the unit tests
 * drive it with a fake.
 */

export const HANDSHAKE_TIMEOUT_MS = 10_000
export const PING_INTERVAL_MS = 5_000

export type DeadReason = 'handshake-timeout' | 'crash'

export interface HostHandlers {
  /** Every message from the worker, including `ready`, `pong` and `log`. */
  message(msg: FromWorker): void
  /** The worker cannot be used any more (the host has already terminated it). Called at most once. */
  dead(reason: DeadReason, detail?: string): void
}

export interface WorkerHost {
  readonly node: NodeId
  post(msg: ToWorker, transfer?: Transferable[]): void
  /** Idempotent. After this no handler is called again. */
  terminate(): void
}

/** Creates the host for `service`'s `index`-th node. The scheduler is injected with one of these. */
export type HostFactory = (service: ServiceId, index: number, handlers: HostHandlers) => WorkerHost

/** The slice of `Worker` the host uses; tests pass a fake. */
export interface RawWorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void
  terminate(): void
  onmessage: ((event: { data: unknown }) => void) | null
  onerror: ((event: { message?: string; preventDefault?: () => void }) => void) | null
  onmessageerror: ((event: unknown) => void) | null
}

export interface HostOptions {
  handshakeTimeoutMs?: number
  pingIntervalMs?: number
  /** Pings are only sent while this returns true. Default: telemetry's board-visibility flag, wired by the scheduler. */
  isBoardVisible?: () => boolean
  createRaw?: (node: NodeId) => RawWorkerLike
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  setIntervalTimer?: (fn: () => void, ms: number) => unknown
  clearIntervalTimer?: (handle: unknown) => void
}

export function createWorker(
  service: ServiceId,
  index: number,
  handlers: HostHandlers,
  options: HostOptions = {},
): WorkerHost {
  const node = nodeIdFor(service, index)
  const {
    handshakeTimeoutMs = HANDSHAKE_TIMEOUT_MS,
    pingIntervalMs = PING_INTERVAL_MS,
    isBoardVisible = () => false,
    createRaw = (id: NodeId) => createRawWorker(id) as unknown as RawWorkerLike,
    now = () => performance.now(),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    setIntervalTimer = (fn, ms) => setInterval(fn, ms),
    clearIntervalTimer = (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  } = options

  let alive = true
  let ready = false
  let raw: RawWorkerLike | null = null
  let handshakeTimer: unknown
  let pingTimer: unknown

  const stopTimers = () => {
    if (handshakeTimer !== undefined) clearTimer(handshakeTimer)
    if (pingTimer !== undefined) clearIntervalTimer(pingTimer)
    handshakeTimer = undefined
    pingTimer = undefined
  }

  const kill = () => {
    alive = false
    stopTimers()
    if (raw) {
      raw.onmessage = null
      raw.onerror = null
      raw.onmessageerror = null
      try {
        raw.terminate()
      } catch {
        /* already gone */
      }
    }
  }

  const die = (reason: DeadReason, detail?: string) => {
    if (!alive) return
    kill()
    handlers.dead(reason, detail)
  }

  try {
    raw = createRaw(node)
  } catch (error) {
    // `new Worker` can throw synchronously (blocked by CSP, unsupported). Report it asynchronously so
    // the caller finishes registering this host before hearing about its death.
    const detail = error instanceof Error ? error.message : String(error)
    alive = false
    setTimer(() => handlers.dead('crash', detail), 0)
    return { node, post: () => undefined, terminate: () => undefined }
  }

  raw.onmessage = (event) => {
    if (!alive) return
    const msg = event.data as FromWorker
    if (msg.type === 'ready') {
      if (ready) return
      ready = true
      if (handshakeTimer !== undefined) clearTimer(handshakeTimer)
      handshakeTimer = undefined
      pingTimer = setIntervalTimer(() => {
        if (alive && isBoardVisible()) raw?.postMessage({ type: 'ping', at: now() } satisfies ToWorker)
      }, pingIntervalMs)
    }
    handlers.message(msg)
  }
  raw.onerror = (event) => {
    // Keep the console clean: a dead node is reported through the scheduler's lastEvent instead.
    event.preventDefault?.()
    die('crash', event.message)
  }
  raw.onmessageerror = () => die('crash', 'a message could not be deserialized')

  handshakeTimer = setTimer(() => die('handshake-timeout', `no ready message within ${handshakeTimeoutMs} ms`), handshakeTimeoutMs)

  return {
    node,
    post(msg, transfer) {
      if (!alive || !raw) return
      if (transfer && transfer.length > 0) raw.postMessage(msg, transfer)
      else raw.postMessage(msg)
    },
    terminate: kill,
  }
}
