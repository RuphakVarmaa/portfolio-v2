import { announce } from '../../../cluster/live-region.ts'
import { scheduler, type Scheduler } from '../../../cluster/scheduler.ts'
import { copy } from '../../../data/copy.ts'
import type { AnalysisResult } from '../../../lib/review/analyze.ts'
import { readStepMs, startReplay, type ReplayTimers } from '../../../lib/review/replay.ts'
import { TIERS, tierCounts } from '../../../lib/review/tiers.ts'

/**
 * The review panel's shared state. The panel (its "Show me the pipeline" button, the stage list and the
 * schematic's lit parts) lives in the entry chunk and the demo (editor, galley, marginalia) in a lazy chunk;
 * this tiny external store lets both read and drive the same run. It holds no UI: submitting the job is one
 * `scheduler.submit` call, so it costs the entry chunk almost nothing.
 *
 * On the server (and before any run) the snapshot is idle, so the prerendered HTML is constant.
 *
 * `createReviewStore` takes its collaborators (scheduler, live region, clock, the seeds import, the replay
 * pacing), so the unit tests drive it with a fake scheduler and a fake clock. `reviewStore` is the site's own.
 */

export interface ReviewRun {
  id: number
  filename: string
  /** The exact text that was analysed: the galley shows this, so line numbers always match the findings. */
  source: string
  status: 'running' | 'done' | 'error'
  /** The stage the worker reported last, while running. */
  stage?: string
  result?: AnalysisResult
  /** One run, timed on this page from `submit` to the result: the hop to the worker and back included. */
  roundTripMs?: number
  error?: string
}

export interface ReviewState {
  /** The latest request: running, finished, or failed. */
  run: ReviewRun | null
  /**
   * The latest request that finished with a result. The galley and the panel show this, so while a new
   * review runs they keep showing a consistent pair (a source and the findings for that source).
   */
  done: ReviewRun | null
  busy: boolean
  /**
   * How many of the finished run's stages the slow-motion replay has revealed so far ("Show me the pipeline"
   * replays them one at a time). `null`: this run was not replayed (or motion is lite), so every stage is shown
   * as soon as the result is in.
   */
  shown: number | null
}

export interface AnalyzeOptions {
  /** Do not announce the result: nobody asked for it (the review the demo runs when it appears). */
  silent?: boolean
  /** Replay the finished run's stages one at a time on the schematic ("Show me the pipeline"). */
  replay?: boolean
}

export interface ReviewStoreDeps {
  scheduler: Pick<Scheduler, 'submit' | 'isSupported'>
  announce: (text: string) => void
  /** Monotonic milliseconds (`performance.now`). */
  now: () => number
  /** The seeded diffs, loaded only when "Show me the pipeline" is pressed before the demo has appeared. */
  loadSeeds: () => Promise<{ SEEDS: ReadonlyArray<{ filename: string; source: string }> }>
  /** Milliseconds between replayed stages: the `--dur-2` token, 0 under lite motion. */
  stepMs: () => number
  timers?: ReplayTimers
}

const IDLE: ReviewState = { run: null, done: null, busy: false, shown: null }

const round1 = (n: number) => Math.round(n * 10) / 10
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** `Reviewed express-route.js: 7 findings in 22 lines. 2 critical, 1 medium, 3 low, 1 info.` */
export function describeRun(run: ReviewRun): string {
  const result = run.result
  if (!result) return ''
  const counts = tierCounts(result.findings)
  const names = copy.services.review.demo.tiers
  const parts = TIERS.filter((tier) => counts[tier] > 0).map((tier) => `${counts[tier]} ${names[tier - 1].name.toLowerCase()}`)
  const head = `Reviewed ${run.filename}: ${result.findings.length === 0 ? 'no findings' : plural(result.findings.length, 'finding')} in ${plural(result.lines, 'line')}.`
  const tail = parts.length > 0 ? ` ${parts.join(', ')}.` : ''
  const skipped = result.parsed ? '' : ` AST pass ${copy.services.review.demo.astSkipped}.`
  return head + tail + skipped
}

export function createReviewStore(deps: ReviewStoreDeps) {
  let state: ReviewState = IDLE
  let runs = 0
  let current: { cancel(): void } | null = null
  let stopReplay: (() => void) | undefined
  let warmed = false
  const listeners = new Set<() => void>()

  function set(next: ReviewState) {
    state = next
    for (const listener of [...listeners]) listener()
  }

  const store = {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: (): ReviewState => state,
    getServerSnapshot: (): ReviewState => IDLE,

    /** Review `source`. A review still running is cancelled: only the latest one is shown. */
    analyze(source: string, filename: string, options: AnalyzeOptions = {}) {
      current?.cancel()
      stopReplay?.()
      stopReplay = undefined
      runs += 1
      const id = runs
      const started = deps.now()
      set({ ...state, busy: true, shown: null, run: { id, filename, source, status: 'running' } })
      const handle = deps.scheduler.submit(
        'review.analyze',
        { source, filename },
        {
          onProgress: (progress) => {
            if (id !== runs || !progress.stage || state.run?.status !== 'running') return
            set({ ...state, busy: true, run: { ...state.run, stage: progress.stage } })
          },
        },
      )
      current = handle
      handle.promise.then(
        (answer) => {
          if (id !== runs || !state.run) return
          const result = answer as AnalysisResult
          const run: ReviewRun = { ...state.run, status: 'done', stage: undefined, result, roundTripMs: round1(deps.now() - started) }
          // Under lite motion the step is 0: nothing is paced, the stages simply all appear with the result.
          const pace = options.replay ? deps.stepMs() : 0
          if (pace > 0 && result.stages.length > 0) {
            set({ run, done: run, busy: false, shown: 0 })
            stopReplay = startReplay(result.stages.length, pace, (shown) => set({ ...state, shown }), deps.timers)
          } else {
            set({ run, done: run, busy: false, shown: null })
          }
          if (!options.silent) deps.announce(describeRun(run))
        },
        (error: unknown) => {
          if (id !== runs || !state.run || (error instanceof Error && error.name === 'AbortError')) return
          const message = error instanceof Error ? error.message : String(error)
          set({ ...state, busy: false, run: { ...state.run, status: 'error', stage: undefined, error: message } })
          deps.announce(`The review failed: ${message}`)
        },
      )
    },

    /** Review again whatever was reviewed last, or the first seeded diff if nothing has been yet. */
    runCurrent(options: AnalyzeOptions = {}) {
      const last = state.run
      if (last) {
        store.analyze(last.source, last.filename, options)
        return
      }
      void deps.loadSeeds().then(({ SEEDS }) => store.analyze(SEEDS[0].source, SEEDS[0].filename, options))
    },

    /**
     * An empty review, sent once when the demo appears. The review worker loads its parser (acorn, a chunk of
     * its own) on its first job rather than at boot, so this makes the first real review fast. It is a real
     * job (the relay throws once) and its answer is ignored.
     */
    warm() {
      if (warmed || !deps.scheduler.isSupported()) return
      warmed = true
      void deps.scheduler.submit('review.analyze', { source: '', filename: '' }).promise.catch(() => undefined)
    },
  }
  return store
}

export const reviewStore = createReviewStore({
  scheduler,
  announce: (text) => announce(text),
  now: () => performance.now(),
  loadSeeds: () => import('./seeds.ts'),
  stepMs: readStepMs,
})
