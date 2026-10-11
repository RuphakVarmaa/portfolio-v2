import { announce } from '../../../cluster/live-region.ts'
import type { Stage } from '../../../cluster/protocol.ts'
import { scheduler } from '../../../cluster/scheduler.ts'
import { copy } from '../../../data/copy.ts'
import type { FuzzLine, FuzzRunState, FuzzScheduler } from '../../../lib/policy/fuzz-run.ts'
import { readStepMs, startReplay, type ReplayTimers } from '../../../lib/review/replay.ts'

/**
 * The one piece of policy state that two places need: the panel (its "Show me the pipeline" button, the
 * stage list, the schematic's lit parts) lives in the entry chunk, the Playground (the audit tape, the
 * fuzz ledger) in a lazy chunk. A tiny external store lets both read and drive the same run, whoever
 * started it. The fuzz runner itself is imported on demand, so it stays out of the entry chunk.
 *
 * On the server (and before any run) the snapshot is the idle state, so the prerendered HTML is constant.
 *
 * `createPolicyStore` takes its collaborators (scheduler, live region, the lazy import, the replay pacing),
 * so the unit tests drive the real runner with fake workers and a fake clock. `policyStore` is the site's own.
 */

export type TapeEntry = FuzzLine

export interface PolicyState {
  /** Audit lines and fuzz events, oldest first. */
  tape: readonly TapeEntry[]
  /** The current or most recent fuzz run. */
  run: FuzzRunState | null
  /** A fuzz is running (or about to). */
  busy: boolean
  /** The three pipeline stages of the last finished fuzz, summed over its batches. Empty until one finished. */
  stages: readonly Stage[]
  /**
   * How many of `stages` the slow-motion replay has revealed so far ("Show me the pipeline" replays the stages
   * one at a time). `null`: this run was not replayed (or motion is lite), so every stage is shown as soon as the
   * run ends.
   */
  shown: number | null
}

export interface StartOptions {
  /** Unplug policy-b in the middle of the run. */
  plug: boolean
  /** Replay the finished run's stages one at a time on the schematic ("Show me the pipeline"). */
  replay?: boolean
}

export interface PolicyStoreDeps {
  scheduler: FuzzScheduler
  announce: (text: string) => void
  /** The fuzz runner, loaded when the first run starts (a lazy chunk on the site). */
  loadFuzz: () => Promise<typeof import('../../../lib/policy/fuzz-run.ts')>
  /** Milliseconds between replayed stages: the `--dur-2` token, 0 under lite motion. */
  stepMs: () => number
  timers?: ReplayTimers
}

/** The tape keeps this many lines (the Tape component shows the newest 200). */
const TAPE_LIMIT = 400

const IDLE: PolicyState = { tape: [], run: null, busy: false, stages: [], shown: null }

export function createPolicyStore(deps: PolicyStoreDeps) {
  let state: PolicyState = IDLE
  let runs = 0
  let lines = 0
  let stopReplay: (() => void) | undefined
  const listeners = new Set<() => void>()

  function set(patch: Partial<PolicyState>) {
    state = { ...state, ...patch }
    for (const listener of [...listeners]) listener()
  }

  const store = {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: (): PolicyState => state,
    getServerSnapshot: (): PolicyState => IDLE,

    /** Append lines to the audit tape. */
    addTape(entries: readonly TapeEntry[]) {
      if (entries.length === 0) return
      const next = [...state.tape, ...entries]
      set({ tape: next.length > TAPE_LIMIT ? next.slice(-TAPE_LIMIT) : next })
    },

    /** A line for something the visitor did on the page (an evaluation), with a store-unique id. */
    line(text: string, tone: TapeEntry['tone']): TapeEntry {
      lines += 1
      return { id: `e${lines}`, text, tone }
    },

    /**
     * Start a fuzz. With `plug`, policy-b is unplugged mid-run. Ignored while one is already running. Resolves
     * when the run has ended; never rejects.
     */
    async start(options: StartOptions): Promise<void> {
      if (state.busy) return
      stopReplay?.()
      stopReplay = undefined
      runs += 1
      const id = runs
      set({ busy: true, stages: [], shown: null, run: null })
      let fuzz: Awaited<ReturnType<PolicyStoreDeps['loadFuzz']>>
      try {
        fuzz = await deps.loadFuzz()
      } catch {
        store.addTape([store.line('The fuzz could not be loaded.', 'live')])
        set({ busy: false })
        return
      }
      const handle = fuzz.startFuzz(deps.scheduler, {
        id,
        seed: id,
        plugAfter: options.plug ? fuzz.PLUG_AFTER : null,
        onChange: (run) => set({ run }),
        onLine: (line) => store.addTape([line]),
      })
      const final = await handle.done
      const summary = final.summary
      const stages = final.status === 'done' && summary ? summary.stages : []
      // Under lite motion the step is 0: nothing is paced, the stages simply all appear when the run ends.
      const pace = options.replay ? deps.stepMs() : 0
      if (pace > 0 && stages.length > 0) {
        set({ busy: false, run: final, stages, shown: 0 })
        stopReplay = startReplay(stages.length, pace, (shown) => set({ shown }), deps.timers)
      } else {
        set({ busy: false, run: final, stages, shown: null })
      }
      if (final.status === 'done' && summary) {
        const result = copy.services.policy.demo.fuzzResult({
          leaks: summary.leaks,
          evaluated: summary.evaluated,
          perSecond: summary.perSecond,
          p95ms: summary.p95ms,
        })
        store.addTape([store.line(result, summary.leaks === 0 ? 'cobalt' : 'live')])
        deps.announce(result)
      } else if (final.error) {
        deps.announce(final.error)
      }
    },
  }
  return store
}

export const policyStore = createPolicyStore({
  scheduler,
  announce: (text) => announce(text),
  loadFuzz: () => import('../../../lib/policy/fuzz-run.ts'),
  stepMs: readStepMs,
})
