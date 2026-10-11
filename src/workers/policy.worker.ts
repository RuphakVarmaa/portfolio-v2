import { auditLine, decide, rowNumberFor, type EvaluateResult } from '../lib/policy/engine.ts'
import { runBatch, type BatchResult } from '../lib/policy/fuzz.ts'
import { defineWorker } from './_base.ts'

/**
 * The policy service worker. This one script backs BOTH nodes of the pool (policy-a, policy-b): the
 * scheduler names each Worker instance after its node and `defineWorker` reads `self.name`.
 *
 *   policy.evaluate  one request through the pure engine, plus the audit line the production system would write
 *   policy.fuzz      one batch of seeded requests (about half across tenants), counting leaks and timing the stages
 *
 * Both answer with a superset of the protocol's result type (`EvaluateResult`, `BatchResult`): the extra
 * fields are measurements the panel shows, and the protocol file is untouched.
 */

/** One evaluation takes a few microseconds, below what `performance.now()` can resolve, so `us` is a mean of this many runs. */
const EVALUATE_RUNS = 2000
/** A batch is 1,000 requests; this only stops a stray caller from pinning a worker. */
const MAX_BATCH = 100_000

const round1 = (n: number) => Math.round(n * 10) / 10

defineWorker('policy-a', {
  'policy.evaluate': (payload, ctx) => {
    const decision = decide(payload)
    const row = rowNumberFor(payload.resource)
    const audit = auditLine(payload, decision, Date.now(), row)

    // The same evaluation, repeated, for a time that the clock can resolve. The sum keeps the work observable.
    let chars = 0
    const started = performance.now()
    for (let run = 0; run < EVALUATE_RUNS; run++) chars += auditLine(payload, decide(payload), 0, row, run).length
    const us = round1(((performance.now() - started) * 1000) / EVALUATE_RUNS)

    const result: EvaluateResult = {
      allow: decision.allow,
      policy: decision.policy,
      audit,
      us: chars > 0 ? us : 0,
      stop: decision.stop,
      runs: EVALUATE_RUNS,
      node: ctx.node,
    }
    return result
  },

  'policy.fuzz': (payload, ctx) => {
    const batch: BatchResult = { ...runBatch({ ...payload, n: Math.min(payload.n, MAX_BATCH) }), node: ctx.node }
    return batch
  },
})
