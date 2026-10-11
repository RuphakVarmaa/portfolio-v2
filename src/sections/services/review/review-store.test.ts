import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Finding, JobPayload, Stage } from '../../../cluster/protocol.ts'
import type { SubmitOptions } from '../../../cluster/scheduler.ts'
import type { AnalysisResult } from '../../../lib/review/analyze.ts'
import type { ReplayTimers } from '../../../lib/review/replay.ts'
import { createReviewStore, describeRun, type ReviewRun } from './review-store.ts'

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

const STAGES: Stage[] = [
  { name: 'parse', ms: 0.4 },
  { name: 'lint patterns', ms: 0.2 },
  { name: 'AST pass', ms: 0.1 },
  { name: 'tier', ms: 0.002 },
  { name: 'post', ms: 0.001 },
]

const finding = (tier: Finding['tier'], line: number): Finding => ({ ruleId: 'style.var', tier, line, message: 'm', fix: 'f', stage: 'ast' })

const resultOf = (findings: Finding[], parsed = true): AnalysisResult => ({ findings, stages: STAGES, parsed, lines: 22, commentChars: 10 })

interface Pending {
  payload: JobPayload['review.analyze']
  options: SubmitOptions | undefined
  resolve(result: AnalysisResult): void
  reject(error: unknown): void
  cancelled: boolean
}

/** A scheduler whose jobs the test settles by hand, in any order. */
function rig(options: { stepMs?: number; supported?: boolean } = {}) {
  const jobs: Pending[] = []
  const announced: string[] = []
  const clock = fakeTimers()
  let time = 0
  const store = createReviewStore({
    scheduler: {
      isSupported: () => options.supported ?? true,
      submit: ((kind: string, payload: JobPayload['review.analyze'], submitOptions?: SubmitOptions) => {
        assert.equal(kind, 'review.analyze')
        const job = { payload, options: submitOptions, cancelled: false } as Pending
        const promise = new Promise<unknown>((resolve, reject) => {
          job.resolve = (result) => resolve(result)
          job.reject = reject
        })
        jobs.push(job)
        return {
          id: `j${jobs.length}`,
          kind,
          promise,
          cancel: () => {
            job.cancelled = true
            job.reject(Object.assign(new Error('Job cancelled'), { name: 'AbortError' }))
          },
        }
      }) as never,
    },
    announce: (text) => announced.push(text),
    now: () => (time += 5),
    loadSeeds: async () => ({ SEEDS: [{ filename: 'first.js', source: 'var a = 1\n' }] }),
    stepMs: () => options.stepMs ?? 240,
    timers: clock.timers,
  })
  return { store, jobs, announced, clock }
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

test('the idle state is constant, on the server and before any review', () => {
  const { store } = rig()
  assert.equal(store.getServerSnapshot(), store.getSnapshot())
  assert.deepEqual(store.getSnapshot(), { run: null, done: null, busy: false, shown: null })
})

test('a review: busy while the worker runs, then the result, its round trip and one announcement', async () => {
  const { store, jobs, announced } = rig()
  store.analyze('var a = 1', 'a.js')
  assert.equal(store.getSnapshot().busy, true)
  assert.equal(store.getSnapshot().run?.status, 'running')
  assert.deepEqual(jobs[0].payload, { source: 'var a = 1', filename: 'a.js' })

  jobs[0].resolve(resultOf([finding(4, 1)]))
  await tick()
  const state = store.getSnapshot()
  assert.equal(state.busy, false)
  assert.equal(state.run?.status, 'done')
  assert.equal(state.done, state.run)
  assert.ok((state.run?.roundTripMs ?? 0) > 0, 'a measured round trip')
  assert.equal(state.shown, null)
  assert.deepEqual(announced, ['Reviewed a.js: 1 finding in 22 lines. 1 low.'])
})

test('the review the demo runs when it appears is silent; a review the visitor asked for is announced', async () => {
  const { store, jobs, announced } = rig()
  store.analyze('x', 'seed.js', { silent: true })
  jobs[0].resolve(resultOf([]))
  await tick()
  assert.deepEqual(announced, [], 'nothing is announced for a review nobody asked for')
  store.analyze('y', 'asked.js')
  jobs[1].resolve(resultOf([]))
  await tick()
  assert.deepEqual(announced, ['Reviewed asked.js: no findings in 22 lines.'])
})

test('progress messages name the stage the worker reached, while running', () => {
  const { store, jobs } = rig()
  store.analyze('x', 'a.js')
  jobs[0].options?.onProgress?.({ type: 'progress', id: 'j1', stage: 'lint patterns' })
  assert.equal(store.getSnapshot().run?.stage, 'lint patterns')
})

test('a newer review cancels the older one and the older answer is ignored', async () => {
  const { store, jobs, announced } = rig()
  store.analyze('one', 'one.js')
  store.analyze('two', 'two.js')
  assert.equal(jobs[0].cancelled, true, 'the first job was cancelled')
  jobs[1].resolve(resultOf([finding(1, 3)]))
  await tick()
  assert.equal(store.getSnapshot().done?.filename, 'two.js')
  // The first job answers late; it must not replace the newer result.
  jobs[0].resolve(resultOf([]))
  await tick()
  assert.equal(store.getSnapshot().done?.filename, 'two.js')
  assert.equal(announced.length, 1)
})

test('a failed review is announced and keeps the last good result on show', async () => {
  const { store, jobs, announced } = rig()
  store.analyze('one', 'one.js')
  jobs[0].resolve(resultOf([]))
  await tick()
  store.analyze('two', 'two.js')
  jobs[1].reject(new Error('boom'))
  await tick()
  const state = store.getSnapshot()
  assert.equal(state.run?.status, 'error')
  assert.equal(state.run?.error, 'boom')
  assert.equal(state.busy, false)
  assert.equal(state.done?.filename, 'one.js', 'the galley keeps a consistent source and findings')
  assert.equal(announced.at(-1), 'The review failed: boom')
})

test('"Show me the pipeline": the stages are replayed one at a time after the result, the first at once', async () => {
  const { store, jobs, clock, announced } = rig({ stepMs: 240 })
  store.analyze('x', 'a.js', { replay: true })
  jobs[0].resolve(resultOf([finding(4, 1)]))
  await tick()
  assert.equal(store.getSnapshot().shown, 1)
  assert.equal(announced.length, 1, 'announced when the result is in, not after the replay')
  for (let expected = 2; expected <= 5; expected++) {
    clock.advance(240)
    assert.equal(store.getSnapshot().shown, expected)
  }
  assert.equal(clock.pending(), 0)
  assert.equal(announced.length, 1)
})

test('under lite motion there is no replay: every stage shows with the result', async () => {
  const { store, jobs, clock } = rig({ stepMs: 0 })
  store.analyze('x', 'a.js', { replay: true })
  jobs[0].resolve(resultOf([]))
  await tick()
  assert.equal(store.getSnapshot().shown, null)
  assert.equal(clock.pending(), 0)
})

test('a new review stops a replay that is still going', async () => {
  const { store, jobs, clock } = rig({ stepMs: 240 })
  store.analyze('x', 'a.js', { replay: true })
  jobs[0].resolve(resultOf([]))
  await tick()
  clock.advance(240)
  assert.equal(store.getSnapshot().shown, 2)
  store.analyze('y', 'b.js')
  assert.equal(store.getSnapshot().shown, null)
  assert.equal(clock.pending(), 0, 'the old replay timer is gone')
})

test('runCurrent reviews again whatever was reviewed last, keeping its name and text', async () => {
  const { store, jobs } = rig()
  store.analyze('const q = 1', 'mine.js')
  jobs[0].resolve(resultOf([]))
  await tick()
  store.runCurrent({ replay: true })
  assert.deepEqual(jobs[1].payload, { source: 'const q = 1', filename: 'mine.js' })
})

test('runCurrent before anything was reviewed loads the first seeded diff', async () => {
  const { store, jobs } = rig()
  store.runCurrent()
  await tick()
  assert.deepEqual(jobs[0].payload, { source: 'var a = 1\n', filename: 'first.js' })
})

test('warm sends one empty review, once, and only when workers exist', () => {
  const warm = rig()
  warm.store.warm()
  warm.store.warm()
  assert.equal(warm.jobs.length, 1)
  assert.deepEqual(warm.jobs[0].payload, { source: '', filename: '' })
  assert.equal(warm.store.getSnapshot().run, null, 'the warm-up is not a review the visitor sees')

  const none = rig({ supported: false })
  none.store.warm()
  assert.equal(none.jobs.length, 0)
})

test('describeRun reads like a sentence and counts by tier, naming a skipped AST pass', () => {
  const run = (result: AnalysisResult): ReviewRun => ({ id: 1, filename: 'express-route.js', source: '', status: 'done', result })
  assert.equal(
    describeRun(run(resultOf([finding(1, 1), finding(1, 2), finding(3, 3), finding(4, 4), finding(4, 5), finding(4, 6), finding(5, 7)]))),
    'Reviewed express-route.js: 7 findings in 22 lines. 2 critical, 1 medium, 3 low, 1 info.',
  )
  assert.equal(describeRun(run(resultOf([]))), 'Reviewed express-route.js: no findings in 22 lines.')
  assert.equal(
    describeRun(run(resultOf([finding(5, 1)], false))),
    'Reviewed express-route.js: 1 finding in 22 lines. 1 info. AST pass skipped: not parseable as JavaScript.',
  )
  assert.equal(describeRun({ id: 1, filename: 'x.js', source: '', status: 'running' }), '')
})
