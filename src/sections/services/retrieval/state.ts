import type { Stage } from '../../../cluster/protocol.ts'

/**
 * The "Show me the pipeline" state, shared by the panel (which owns the button, the stage list and the
 * schematic, and ships in the initial JavaScript) and the demo (which runs the real search and ships in a
 * lazy chunk). A tiny external store keeps the panel's side to a few hundred bytes.
 *
 * Nothing here is invented: `stages` are timings a worker measured, and `active` / `annotations` are replayed
 * from them one stage at a time.
 */
export interface PipelineState {
  /** Measured stages shown so far (the panel prints name and ms). */
  readonly stages: readonly Stage[]
  /** Schematic part ids drawn as running right now. */
  readonly active: readonly string[]
  /** Small mono text under a part: its measured time. */
  readonly annotations: Readonly<Record<string, string>>
  /** A run is in flight (the button shows busy). */
  readonly busy: boolean
  /** Milliseconds per stage while the stages are replayed on a timer (so the panel can say the pacing is a timer); null otherwise. */
  readonly paceMs: number | null
}

const EMPTY: PipelineState = Object.freeze({ stages: [], active: [], annotations: {}, busy: false, paceMs: null })

let state: PipelineState = EMPTY
let pending = false
const listeners = new Set<() => void>()
const runners = new Set<() => void>()

function emit() {
  for (const listener of [...listeners]) listener()
}

export const pipeline = {
  get: (): PipelineState => state,
  /** What the server renders: nothing has run. */
  getServer: (): PipelineState => EMPTY,
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  patch(next: Partial<PipelineState>): void {
    state = { ...state, ...next }
    emit()
  },
  reset(): void {
    state = EMPTY
    emit()
  },
  /** The panel's button. If the demo has not loaded yet the request waits for it. */
  requestRun(): void {
    if (runners.size === 0) {
      pending = true
      state = { ...state, busy: true }
      emit()
      return
    }
    for (const runner of [...runners]) runner()
  },
  /** The demo registers its runner; a request made before it loaded runs now. Returns the unregister function. */
  onRun(runner: () => void): () => void {
    runners.add(runner)
    if (pending) {
      pending = false
      queueMicrotask(runner)
    }
    return () => {
      runners.delete(runner)
    }
  },
}
